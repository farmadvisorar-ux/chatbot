import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getStripe, siteOrigin } from '../_lib/stripe.js';

/**
 * Seller payout setup.
 *
 *   GET  -> whether this seller can currently receive payouts
 *   POST -> a Stripe-hosted onboarding link to add/finish bank details
 *
 * The seller enters bank details on Stripe's own pages. Nothing sensitive is
 * posted to or stored by this app — only the opaque "acct_..." id — which is
 * what keeps this service out of PCI scope.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    const stripe = getStripe();
    if (!stripe) {
        error(res, 501, 'Payments are not configured on this deployment yet.');
        return;
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    const pool = getPool();
    const existing = await pool.query<{ stripe_account_id: string | null }>(
        'SELECT stripe_account_id FROM users WHERE id = $1',
        [user.userId],
    );
    let accountId = existing.rows[0]?.stripe_account_id ?? null;

    if (req.method === 'GET') {
        if (!accountId) {
            json(res, 200, { connected: false, payoutsEnabled: false });
            return;
        }
        const account = await stripe.accounts.retrieve(accountId);
        // Mirror Stripe's view so the rest of the app doesn't have to call out.
        await pool.query('UPDATE users SET payouts_enabled = $2 WHERE id = $1', [user.userId, Boolean(account.payouts_enabled)]);
        json(res, 200, {
            connected: true,
            payoutsEnabled: Boolean(account.payouts_enabled),
            detailsSubmitted: Boolean(account.details_submitted),
        });
        return;
    }

    if (!accountId) {
        const account = await stripe.accounts.create({
            type: 'express',
            email: user.email,
            capabilities: { transfers: { requested: true } },
            business_type: 'individual',
            metadata: { clerkUserId: user.userId },
        });
        accountId = account.id;
        await pool.query('UPDATE users SET stripe_account_id = $2 WHERE id = $1', [user.userId, accountId]);
    }

    // Onboarding links are single-use and short-lived, so one is minted per request.
    const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${siteOrigin()}/?payouts=refresh`,
        return_url: `${siteOrigin()}/?payouts=done`,
        type: 'account_onboarding',
    });

    json(res, 200, { url: link.url });
}
