import type { VercelRequest, VercelResponse } from '@vercel/node';
import type pg from 'pg';
import { Webhook } from 'svix';
import type Stripe from 'stripe';
import { getPool } from '../_lib/db.js';
import { error, json, requireMethod } from '../_lib/http.js';
import { sendWelcomeEmail } from '../_lib/email.js';
import { stripeClient, tierForSubscription } from '../_lib/billing.js';

// Svix signature verification needs the exact raw bytes that were sent.
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
 * Inbound provider webhooks, on one dynamic route so adding a provider costs
 * no extra serverless function:
 *   /api/webhooks/clerk   -> user lifecycle
 *   /api/webhooks/stripe  -> subscription lifecycle, which is what grants a tier
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

/**
 * Subscription lifecycle. This is the only thing in the system that can set
 * `users.tier` above 'free', which is deliberate: entitlement follows Stripe's
 * record of what was actually paid for, and nothing in the app can grant
 * itself a plan.
 *
 * Every event is verified against the signing secret before it is read. An
 * unverified POST to this URL is an attacker handing themselves a paid
 * account, so a missing secret fails the request rather than falling back to
 * trusting the body.
 */
async function handleStripe(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const stripe = stripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
        error(res, 501, 'Webhook is not configured');
        return;
    }

    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
        error(res, 400, 'Missing Stripe signature');
        return;
    }

    let event: Stripe.Event;
    try {
        // Raw bytes, not the parsed body: the signature covers the exact
        // payload Stripe sent, and re-serialising JSON would not reproduce it.
        event = stripe.webhooks.constructEvent(await readRawBody(req), signature, secret);
    } catch {
        error(res, 400, 'Invalid webhook signature');
        return;
    }

    const pool = getPool();

    // Stripe retries until it gets a 2xx, and a retry of a subscription event
    // must not re-run its side effects. The insert is the lock: if this event
    // id is already recorded, another delivery handled it.
    const claimed = await pool.query(
        'INSERT INTO stripe_events_processed (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [event.id],
    );
    if (!claimed.rowCount) {
        json(res, 200, { received: true, duplicate: true });
        return;
    }

    try {
        await applyStripeEvent(pool, stripe, event);
    } catch (err) {
        // Release the claim so Stripe's retry can try again, rather than
        // leaving the account un-upgraded with the event marked done.
        await pool.query('DELETE FROM stripe_events_processed WHERE event_id = $1', [event.id]);
        console.error(`Stripe event ${event.id} (${event.type}) failed:`, err);
        error(res, 500, 'Could not process this event.');
        return;
    }

    json(res, 200, { received: true });
}

async function applyStripeEvent(pool: pg.Pool, stripe: Stripe, event: Stripe.Event): Promise<void> {
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const userId = session.client_reference_id ?? session.metadata?.auditpulse_user_id;
            const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
            if (!userId || !customerId) return;

            // Link the customer first, so the billing-portal button works even
            // if the subscription event that follows is delayed.
            await pool.query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1', [userId, customerId]);

            // The tier itself still comes from the subscription rather than
            // from this session's metadata, so one code path decides
            // entitlement for checkout, portal changes and renewals alike.
            const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
            if (subscriptionId) {
                await applySubscription(pool, userId, await stripe.subscriptions.retrieve(subscriptionId));
            }
            return;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            const userId = await resolveUserId(pool, subscription);
            if (!userId) {
                console.error(`Stripe subscription ${subscription.id} has no account to apply to.`);
                return;
            }
            await applySubscription(pool, userId, subscription);
            return;
        }

        default:
            // Everything else is recorded as processed and ignored on purpose:
            // invoice and payment events do not change entitlement, which is
            // decided entirely by the subscription's own status.
            return;
    }
}

/**
 * Which account a subscription belongs to.
 *
 * Metadata first, because it is written at checkout and survives the customer
 * being re-linked; the customer id is the fallback for a subscription created
 * outside our checkout (from the Stripe dashboard, say).
 */
async function resolveUserId(pool: pg.Pool, subscription: Stripe.Subscription): Promise<string | null> {
    const fromMetadata = subscription.metadata?.auditpulse_user_id;
    if (fromMetadata) return fromMetadata;

    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (!customerId) return null;
    const { rows } = await pool.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
    return rows[0]?.id ?? null;
}

/** Writes the entitlement a subscription implies. The only writer of users.tier. */
async function applySubscription(pool: pg.Pool, userId: string, subscription: Stripe.Subscription): Promise<void> {
    // tierForSubscription already resolves every non-entitled status —
    // cancelled, unpaid, incomplete_expired — to 'free', so the delete event
    // needs no separate branch here.
    const tier = tierForSubscription(subscription);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const periodEnd = subscription.items.data[0]?.current_period_end ?? null;

    await pool.query(
        `UPDATE users
            SET tier = $2,
                stripe_subscription_id = $3,
                subscription_status = $4,
                subscription_current_period_end = $5,
                stripe_customer_id = COALESCE($6, stripe_customer_id)
          WHERE id = $1`,
        [
            userId,
            tier,
            subscription.id,
            subscription.status,
            periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            customerId ?? null,
        ],
    );
}
