import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { getStripe, siteOrigin, priceIdFor, type PlanId, type BillingInterval } from '../_lib/stripe.js';

/**
 * Creates a Stripe Checkout Session for one of four options: Audit or
 * Audit + Fix, each either a recurring monthly subscription or a one-time
 * annual payment. The annual option uses Checkout's 'payment' mode (not
 * 'subscription') since it's a one-time fee, not a recurring charge — the
 * webhook grants a year of access via users.plan_expires_at instead of
 * tracking a Stripe Subscription object.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
