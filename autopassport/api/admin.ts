import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod } from './_lib/http.js';
import { clean } from './_lib/validate.js';
import { CERTIFICATION_FEE_CENTS } from './_lib/pricing.js';

/**
 * GET  /api/admin          -> review queue + revenue summary
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

    if (!isDatabaseConfigured()) {
        error(res, 501, 'The database is not configured on this deployment yet, so there is nothing to review.');
        return;
    }

    const pool = getPool();

    if (req.method === 'GET') {
        const [queue, revenue] = await Promise.all([
            pool.query(
                `SELECT id, developer_email AS "developerEmail", name, tagline, category,
                        description, icon_url AS "iconUrl", store_url AS "storeUrl",
                        status, paid_at AS "paidAt", created_at AS "createdAt"
                 FROM apps WHERE status <> 'awaiting_payment'
                 ORDER BY CASE status WHEN 'pending_review' THEN 0 ELSE 1 END, created_at DESC
                 LIMIT 200`,
            ),
            pool.query(
                `SELECT
                     (SELECT count(*)::int FROM apps WHERE status IN ('pending_review', 'certified', 'rejected')) AS "paidSubmissions",
                     (SELECT count(*)::int FROM apps WHERE status = 'certified') AS "certified",
                     (SELECT count(*)::int FROM apps WHERE status = 'pending_review') AS "pendingReview"`,
            ),
        ]);
        json(res, 200, {
            queue: queue.rows,
            revenue: { ...revenue.rows[0], feeCents: CERTIFICATION_FEE_CENTS },
        });
        return;
    }

    const body = (req.body || {}) as { action?: string; id?: string };
    const action = clean(body.action, 24);
    const id = clean(body.id, 64);

    if (!id) {
        error(res, 400, 'Provide the id');
        return;
    }
    if (action !== 'approve' && action !== 'reject') {
        error(res, 400, "Provide an action of 'approve' or 'reject'");
        return;
    }

    const nextStatus = action === 'approve' ? 'certified' : 'rejected';
    const updated = await pool.query(
        `UPDATE apps SET status = $2, certified_at = CASE WHEN $2 = 'certified' THEN now() ELSE certified_at END
         WHERE id = $1 AND status = 'pending_review' RETURNING name, status`,
        [id, nextStatus],
    );
    if (!updated.rows[0]) {
        error(res, 404, 'Submission not found, or not awaiting review');
        return;
    }
    json(res, 200, { ok: true, name: updated.rows[0].name, status: updated.rows[0].status });
}
