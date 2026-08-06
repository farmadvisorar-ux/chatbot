import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod } from './_lib/http.js';
import { clean } from './_lib/validate.js';
import { guarded } from './_lib/errors.js';
import { SCHEMA_SQL } from './_lib/schema.js';

/**
 * GET  /api/admin           -> review queue + revenue summary
 * POST /api/admin {action:'approve'|'reject', id}
 *
 * Guarded by ADMIN_SECRET rather than a user role — there is no role system
 * yet, and this is honest about that instead of implying per-user permissions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('admin', res, async () => {
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

        // Applies the schema from inside the deployment, where the connection
        // string already lives. Running `npm run migrate` needs that string on
        // whatever machine you are sitting at, which means either copying a
        // live credential around or having the Postgres port open outbound —
        // neither is true from every environment this gets operated from.
        //
        // Behind ADMIN_SECRET because it writes to the database. Safe to call
        // repeatedly: every statement in the schema is IF NOT EXISTS and there
        // are no DROPs, both asserted in tests/schema.test.mjs.
        if (req.method === 'POST' && clean((req.body as { action?: string } | undefined)?.action, 24) === 'migrate') {
            await pool.query(SCHEMA_SQL);
            const { rows } = await pool.query<{ table_name: string }>(
                `SELECT table_name FROM information_schema.tables
                 WHERE table_schema = 'public' ORDER BY table_name`,
            );
            json(res, 200, { ok: true, tables: rows.map(row => row.table_name) });
            return;
        }

        if (req.method === 'GET') {
            const [queue, revenue, publishers] = await Promise.all([
                pool.query(
                    `SELECT id, advertiser_email AS "advertiserEmail", headline, url,
                            cpm_cents AS "cpmCents", budget_cents AS "budgetCents",
                            views_purchased AS "viewsPurchased", views_remaining AS "viewsRemaining",
                            status, paid_at AS "paidAt", created_at AS "createdAt"
                     FROM ad_campaigns WHERE status <> 'awaiting_payment'
                     ORDER BY CASE status WHEN 'pending_review' THEN 0 ELSE 1 END, created_at DESC
                     LIMIT 200`,
                ),
                // Gross is what advertisers paid; owed is what publishers have
                // earned and not yet been paid. Net is what the business actually
                // keeps, and is the only one of the three worth looking at alone.
                pool.query(
                    `SELECT
                         (SELECT COALESCE(sum(budget_cents), 0)::bigint FROM ad_campaigns
                          WHERE status IN ('pending_review', 'live', 'exhausted')) AS "grossCents",
                         (SELECT count(*)::int FROM ad_campaigns
                          WHERE status IN ('pending_review', 'live', 'exhausted')) AS "campaigns",
                         (SELECT COALESCE(sum(earnings_microcents - paid_microcents), 0)::bigint
                          FROM publishers) AS "owedMicrocents"`,
                ),
                pool.query(
                    `SELECT id, email, site_url AS "siteUrl", slot_key AS "slotKey", status,
                            views_served AS "viewsServed",
                            (earnings_microcents - paid_microcents)::bigint AS "owedMicrocents",
                            earnings_microcents::bigint AS "earnedMicrocents", created_at AS "createdAt"
                     FROM publishers
                     ORDER BY CASE status WHEN 'pending_review' THEN 0 ELSE 1 END, created_at DESC
                     LIMIT 200`,
                ),
            ]);
            json(res, 200, {
                queue: queue.rows,
                revenue: revenue.rows[0],
                publishers: publishers.rows,
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

        if (action === 'publisher-approve' || action === 'publisher-reject') {
            const updated = await pool.query(
                `UPDATE publishers SET status = $2 WHERE id = $1 AND status = 'pending_review'
                 RETURNING email, status`,
                [id, action === 'publisher-approve' ? 'active' : 'rejected'],
            );
            if (!updated.rows[0]) {
                error(res, 404, 'Publisher not found, or not awaiting review');
                return;
            }
            json(res, 200, { ok: true, email: updated.rows[0].email, status: updated.rows[0].status });
            return;
        }

        if (action === 'publisher-settle') {
            // Marks everything currently owed as paid, for after the money has
            // actually been sent. Recorded as a running total rather than zeroing
            // earnings, so lifetime earnings stay auditable after a payout.
            const updated = await pool.query(
                `UPDATE publishers SET paid_microcents = earnings_microcents
                 WHERE id = $1 RETURNING email, earnings_microcents::bigint AS "earnedMicrocents"`,
                [id],
            );
            if (!updated.rows[0]) {
                error(res, 404, 'Publisher not found');
                return;
            }
            json(res, 200, { ok: true, email: updated.rows[0].email, settled: true });
            return;
        }

        if (action !== 'approve' && action !== 'reject') {
            error(res, 400, "Provide an action of 'approve', 'reject', 'publisher-approve', 'publisher-reject' or 'publisher-settle'");
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
    });
}
