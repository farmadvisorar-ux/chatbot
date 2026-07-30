import type { VercelRequest, VercelResponse } from '@vercel/node';
import type pg from 'pg';
import type Stripe from 'stripe';
import { Webhook } from 'svix';
import { getPool } from '../_lib/db.js';
import { error, json, requireMethod } from '../_lib/http.js';
import { sendWelcomeEmail } from '../_lib/email.js';
import { getStripe, planForPriceId } from '../_lib/stripe.js';

// Both providers' signature verification needs the exact raw bytes sent.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

/**
 * Single dynamic route for /api/webhooks/clerk and /api/webhooks/stripe,
 * consolidated into one function to stay under Vercel's Hobby-plan
 * 12-function cap. URLs are unchanged.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : '';
    if (provider === 'clerk') return handleClerk(req, res);
    if (provider === 'stripe') return handleStripe(req, res);
    error(res, 404, 'Not found.');
}

// ---------------------------------------------------------------- Clerk --

type ClerkUserEvent = {
    type: string;
    data: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email_addresses: Array<{ id: string; email_address: string }>;
        primary_email_address_id: string | null;
    };
};

async function removeUser(pool: pg.Pool, userId: string): Promise<void> {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    } catch (err) {
        if ((err as { code?: string }).code !== '23503') throw err;
        await pool.query(
            `UPDATE users SET email = 'deleted-' || id || '@removed.invalid', name = NULL WHERE id = $1`,
            [userId],
        );
    }
}

async function handleClerk(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        error(res, 501, 'Webhook is not configured');
        return;
    }

    const payload = (await readRawBody(req)).toString('utf8');
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (typeof svixId !== 'string' || typeof svixTimestamp !== 'string' || typeof svixSignature !== 'string') {
        error(res, 400, 'Missing Svix headers');
        return;
    }

    let event: ClerkUserEvent;
    try {
        const webhook = new Webhook(secret);
        event = webhook.verify(payload, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
        }) as ClerkUserEvent;
    } catch {
        error(res, 400, 'Invalid webhook signature');
        return;
    }

    if (event.type === 'user.created' || event.type === 'user.updated') {
        const { data } = event;
        const primaryEmail = data.email_addresses.find(addr => addr.id === data.primary_email_address_id)
            ?? data.email_addresses[0];
        if (primaryEmail) {
            const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;
            const pool = getPool();
            const upserted = await pool.query(
                `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
                 RETURNING (xmax = 0) AS inserted`,
                [data.id, primaryEmail.email_address, name],
            );
            if (event.type === 'user.created' && upserted.rows[0]?.inserted) {
                await sendWelcomeEmail(primaryEmail.email_address, name);
            }
        }
    } else if (event.type === 'user.deleted') {
        await removeUser(getPool(), event.data.id);
    }

    json(res, 200, { received: true });
}

// --------------------------------------------------------------- Stripe --

async function syncSubscription(customerId: string, subscription: Stripe.Subscription): Promise<void> {
    // Stripe moved current_period_end from the subscription to its line items
    // across API versions; read from whichever shape the installed SDK types.
    const subscriptionAny = subscription as unknown as { current_period_end?: number };
    const periodEnd = subscriptionAny.current_period_end ?? subscription.items.data[0]?.current_period_end;
    const plan = planForPriceId(subscription.items.data[0]?.price?.id);
    await getPool().query(
        `UPDATE users SET stripe_subscription_id = $2, subscription_status = $3, subscription_current_period_end = to_timestamp($4), plan = COALESCE($5, plan)
         WHERE stripe_customer_id = $1`,
        [customerId, subscription.id, subscription.status, periodEnd ?? null, plan],
    );
}

/**
 * The annual plans are a one-time Checkout payment (mode: 'payment'), not a
 * Stripe Subscription, so there's no subscription object to sync — instead
 * this grants 365 days of access via plan_expires_at. Buying another year
 * before the current one lapses stacks on top of the remaining time rather
 * than resetting the clock (GREATEST(existing expiry, now)).
 */
async function grantAnnualAccess(customerId: string, plan: 'audit' | 'audit_fix'): Promise<void> {
    await getPool().query(
        `UPDATE users
         SET plan = $2,
             plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + interval '365 days'
         WHERE stripe_customer_id = $1`,
        [customerId, plan],
    );
}

async function handleStripe(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
        error(res, 501, 'Stripe webhook is not configured');
        return;
    }

    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
        error(res, 400, 'Missing Stripe signature');
        return;
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(await readRawBody(req), signature, secret);
    } catch {
        error(res, 400, 'Invalid Stripe signature');
        return;
    }

    // Stripe may redeliver the same event; skip anything already applied so
    // an annual payment's 365 days can't get double-granted on a retry.
    const { rows: dedupRows } = await getPool().query(
        'INSERT INTO stripe_events_processed (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
        [event.id],
    );
    if (!dedupRows.length) {
        json(res, 200, { received: true, duplicate: true });
        return;
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && typeof session.customer === 'string' && typeof session.subscription === 'string') {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await syncSubscription(session.customer, subscription);
        } else if (session.mode === 'payment' && typeof session.customer === 'string' && session.payment_status === 'paid') {
            const plan = session.metadata?.plan === 'audit_fix' ? 'audit_fix' : 'audit';
            await grantAnnualAccess(session.customer, plan);
        }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        if (typeof subscription.customer === 'string') {
            await syncSubscription(subscription.customer, subscription);
        }
    }

    json(res, 200, { received: true });
}
