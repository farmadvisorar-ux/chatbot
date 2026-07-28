import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { getStripe, siteOrigin } from '../_lib/stripe.js';

/** Creates a Stripe Billing Portal session so a subscriber can manage/cancel their plan. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
