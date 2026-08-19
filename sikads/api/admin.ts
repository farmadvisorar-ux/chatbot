import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { clean } from './_lib/validate.js';
import { guarded } from './_lib/errors.js';
import { SCHEMA_SQL } from './_lib/schema.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { isUuid, secretsEqual } from './_lib/secrets.js';

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

        const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
        if (!secretsEqual(provided, secret)) {
            // Throttle failed guesses only — a shared success bucket would let
            // an attacker lock the real operator out by filling it first.
            if (isDatabaseConfigured()) {
                try {
                    const allowed = await checkRateLimit(getPool(), 'admin-auth-fail', clientKey(req), 20, 1);
                    if (!allowed) {
                        error(res, 429, 'Too many failed sign-in attempts. Try again later.');
                        return;
                    }
                } catch {
                    // Rate-limit storage being down must not change the auth
                    // answer — still reject the bad key.
                }
            }
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
                // Gross is every paid budget still on the books — including
                // rejected campaigns, which were charged even if they never
                // went live. Owed is unpaid publisher balance.
                pool.query(
                    `SELECT
                         (SELECT COALESCE(sum(budget_cents), 0)::bigint FROM ad_campaigns
                          WHERE paid_at IS NOT NULL) AS "grossCents",
                         (SELECT count(*)::int FROM ad_campaigns
                          WHERE paid_at IS NOT NULL) AS "campaigns",
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

        if (!id || !isUuid(id)) {
            error(res, 400, 'Provide a valid id');
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
            // Only active publishers with a payable balance can be settled —
            // marking rejected/zero-owed rows paid is a silent no-op that
            // confuses the ledger.
            const updated = await pool.query(
                `WITH before AS (
                     SELECT id, email, earnings_microcents,
                            (earnings_microcents - paid_microcents) AS owed_microcents
                     FROM publishers
                     WHERE id = $1
                       AND status = 'active'
                       AND earnings_microcents > paid_microcents
                 )
                 UPDATE publishers AS p
                 SET paid_microcents = p.earnings_microcents
                 FROM before
                 WHERE p.id = before.id
                 RETURNING before.email AS email,
                           before.earnings_microcents::bigint AS "earnedMicrocents",
                           before.owed_microcents::bigint AS "settledMicrocents"`,
                [id],
            );
            if (!updated.rows[0]) {
                error(res, 404, 'Publisher not found, inactive, or already settled');
                return;
            }
            json(res, 200, {
                ok: true,
                email: updated.rows[0].email,
                settled: true,
                settledMicrocents: updated.rows[0].settledMicrocents,
            });
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
