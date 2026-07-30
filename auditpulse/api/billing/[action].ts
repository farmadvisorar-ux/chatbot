import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { getStripe, siteOrigin, priceIdFor, hasActiveAccess, hasFixAccess, type PlanId, type BillingInterval } from '../_lib/stripe.js';

/**
 * Single dynamic route for every /api/billing/* endpoint, consolidated from
 * three separate functions (checkout, portal, status) to stay under
 * Vercel's Hobby-plan 12-function cap. URLs are unchanged:
 *   /api/billing/checkout -> POST create a Stripe Checkout Session
 *   /api/billing/portal   -> POST create a Stripe Billing Portal session
 *   /api/billing/status   -> GET current plan/subscription status
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const action = typeof req.query.action === 'string' ? req.query.action : '';
    if (action === 'checkout') return handleCheckout(req, res);
    if (action === 'portal') return handlePortal(req, res);
    if (action === 'status') return handleStatus(req, res);
    error(res, 404, 'Not found.');
}

/**
 * Creates a Stripe Checkout Session for one of four options: Audit or
 * Audit + Fix, each either a recurring monthly subscription or a one-time
 * annual payment. The annual option uses Checkout's 'payment' mode (not
 * 'subscription') since it's a one-time fee, not a recurring charge — the
 * webhook grants a year of access via users.plan_expires_at instead of
 * tracking a Stripe Subscription object.
 */
async function handleCheckout(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;

    const plan: PlanId = req.body?.plan === 'audit_fix' ? 'audit_fix' : 'audit';
    const interval: BillingInterval = req.body?.interval === 'year' ? 'year' : 'month';
    const stripe = getStripe();
    const priceId = priceIdFor(plan, interval);
    if (!stripe || !priceId) {
        error(res, 501, 'Billing is not configured on this deployment yet.');
        return;
    }

    const pool = getPool();
    const { rows } = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [user.userId]);
    let customerId: string | null = rows[0]?.stripe_customer_id ?? null;

    if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email, name: user.name ?? undefined, metadata: { userId: user.userId } });
        customerId = customer.id;
        await pool.query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1', [user.userId, customerId]);
    }

    const origin = siteOrigin();
    const session = interval === 'year'
        ? await stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/account.html?checkout=success`,
            cancel_url: `${origin}/account.html?checkout=cancelled`,
            client_reference_id: user.userId,
            metadata: { userId: user.userId, plan },
        })
        : await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/account.html?checkout=success`,
            cancel_url: `${origin}/account.html?checkout=cancelled`,
            client_reference_id: user.userId,
        });

    json(res, 200, { url: session.url });
}

/** Creates a Stripe Billing Portal session so a subscriber can manage/cancel their plan. */
async function handlePortal(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;

    const stripe = getStripe();
    if (!stripe) {
        error(res, 501, 'Billing is not configured on this deployment yet.');
        return;
    }

    const { rows } = await getPool().query('SELECT stripe_customer_id FROM users WHERE id = $1', [user.userId]);
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
        error(res, 404, 'No billing account yet. Subscribe first.');
        return;
    }

    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${siteOrigin()}/account.html`,
    });

    json(res, 200, { url: session.url });
}

async function handleStatus(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;

    const { rows } = await getPool().query(
        'SELECT subscription_status, subscription_current_period_end, plan, plan_expires_at FROM users WHERE id = $1',
        [user.userId],
    );
    const row = rows[0] ?? {};
    json(res, 200, {
        subscriptionStatus: row.subscription_status ?? null,
        active: hasActiveAccess(row),
        plan: row.plan ?? null,
        fixAccess: hasFixAccess(row),
        currentPeriodEnd: row.subscription_current_period_end ?? null,
        planExpiresAt: row.plan_expires_at ?? null,
    });
}
