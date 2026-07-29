import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { getStripe, planForPriceId } from '../_lib/stripe.js';

// Signature verification needs the exact bytes Stripe signed.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
