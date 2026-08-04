import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { json, error, requireMethod } from './_lib/http.js';
import { clean } from './_lib/validate.js';

/**
 * GET  /api/admin           -> review queue + revenue summary
 * POST /api/admin {action:'approve'|'reject', id}
 *
 * Guarded by ADMIN_SECRET rather than a user role — there is no role system
 * yet, and this is honest about that instead of implying per-user permissions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
        error(res, 501, 'Admin access is not configured');
        return;
    }
    if (req.headers.authorization?.replace(/^Bearer\s+/i, '') !== secret) {
        error(res, 401, 'Unauthorized');
        return;
    }

    const pool = getPool();

    if (req.method === 'GET') {
        const [queue, revenue] = await Promise.all([
            pool.query(
                `SELECT id, advertiser_email AS "advertiserEmail", headline, url,
                        cpm_cents AS "cpmCents", budget_cents AS "budgetCents",
                        views_purchased AS "viewsPurchased", views_remaining AS "viewsRemaining",
                        status, paid_at AS "paidAt", created_at AS "createdAt"
                 FROM ad_campaigns WHERE status <> 'awaiting_payment'
                 ORDER BY CASE status WHEN 'pending_review' THEN 0 ELSE 1 END, created_at DESC
                 LIMIT 200`,
            ),
            pool.query(
                `SELECT COALESCE(sum(budget_cents), 0)::int AS "totalCents",
                        count(*)::int AS campaigns
                 FROM ad_campaigns WHERE status IN ('pending_review', 'live', 'exhausted')`,
            ),
        ]);
        json(res, 200, { queue: queue.rows, revenue: revenue.rows[0] });
        return;
    }

    const body = (req.body || {}) as { action?: string; id?: string };
    const action = clean(body.action, 20);
    const id = clean(body.id, 64);

    if (action !== 'approve' && action !== 'reject') {
        error(res, 400, "Provide an action of 'approve' or 'reject'");
        return;
    }
    if (!id) {
        error(res, 400, 'Provide the campaign id');
        return;
    }

    const nextStatus = action === 'approve' ? 'live' : 'rejected';
    const updated = await pool.query(
        `UPDATE ad_campaigns SET status = $2 WHERE id = $1 AND status = 'pending_review' RETURNING headline, status`,
        [id, nextStatus],
    );
    if (!updated.rows[0]) {
        error(res, 404, 'Campaign not found, or not awaiting review');
        return;
    }
    json(res, 200, { ok: true, headline: updated.rows[0].headline, status: updated.rows[0].status });
}
