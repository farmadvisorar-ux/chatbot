import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { clean } from '../_lib/validate.js';
import { insertCandidates, dedupKey } from '../_lib/directory.js';
import { sendListedEmail } from '../_lib/email.js';
import { getStripe } from '../_lib/stripe.js';

/**
 * Single admin endpoint covering submission review and seller payouts.
 *
 *   GET  /api/admin?view=submissions -> founder submissions awaiting review
 *   GET  /api/admin?view=releases    -> paid orders awaiting release to sellers
 *   POST /api/admin {action:'approve'|'reject', id}
 *   POST /api/admin {action:'release', orderId}
 *
 * These were two endpoints until Vercel's Hobby plan cap of 12 serverless
 * functions was hit. They are merged rather than split because both are
 * operator-only actions behind the same secret; if the function budget grows,
 * splitting them back out is mechanical.
 *
 * Guarded by ADMIN_SECRET rather than a user role, which is honest about there
 * being no role system yet instead of implying per-user permissions.
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
        const view = clean(typeof req.query.view === 'string' ? req.query.view : '', 20) || 'submissions';

        if (view === 'releases') {
            const { rows } = await pool.query(
                `SELECT o.id, o.buyer_email AS "buyerEmail", o.price_cents AS "priceCents",
                        o.platform_fee_cents AS "platformFeeCents", o.seller_payout_cents AS "sellerPayoutCents",
                        o.paid_at AS "paidAt", l.name AS "listingName", l.seller_email AS "sellerEmail"
                 FROM marketplace_orders o
                 JOIN marketplace_listings l ON l.id = o.listing_id
                 WHERE o.payment_state = 'paid_held'
                 ORDER BY o.paid_at ASC LIMIT 100`,
            );
            json(res, 200, { awaitingRelease: rows });
            return;
        }

        if (view === 'overview') {
            const [totals, bySource, recent] = await Promise.all([
                pool.query(`SELECT
                    (SELECT count(*)::int FROM directory_entries WHERE status='live') AS live,
                    (SELECT count(*)::int FROM directory_entries WHERE status='live' AND featured) AS featured,
                    (SELECT count(*)::int FROM directory_entries WHERE status='rejected') AS removed,
                    (SELECT count(*)::int FROM directory_entries WHERE status='live' AND discovered_at > now() - interval '24 hours') AS last24h,
                    (SELECT count(*)::int FROM waitlist) AS waitlist,
                    (SELECT count(*)::int FROM users) AS users,
                    (SELECT count(*)::int FROM marketplace_listings WHERE status='live') AS marketListings,
                    (SELECT count(*)::int FROM marketplace_orders WHERE payment_state='paid_held') AS heldOrders,
                    (SELECT COALESCE(sum(platform_fee_cents),0)::int FROM marketplace_orders WHERE payment_state IN ('paid_held','released')) AS feesCents`),
                pool.query(`SELECT source, count(*)::int AS count FROM directory_entries
                            WHERE status='live' GROUP BY source ORDER BY count DESC`),
                pool.query(`SELECT max(discovered_at) AS "lastIngest" FROM directory_entries`),
            ]);
            json(res, 200, {
                totals: totals.rows[0],
                bySource: bySource.rows,
                lastIngest: recent.rows[0]?.lastIngest ?? null,
            });
            return;
        }

        if (view === 'marketplace') {
            // Marketplace listings start pending_review and had no approval
            // path before this — they could only be made live by editing the
            // database directly.
            const { rows } = await pool.query(
                `SELECT l.id, l.name, l.tagline, l.description, l.url, l.price_cents AS "priceCents",
                        l.seller_email AS "sellerEmail", l.status, l.created_at AS "createdAt",
                        u.payouts_enabled AS "payoutsEnabled", u.stripe_account_id IS NOT NULL AS "hasStripe",
                        (SELECT count(*)::int FROM marketplace_orders o WHERE o.listing_id = l.id) AS orders
                 FROM marketplace_listings l
                 LEFT JOIN users u ON u.id = l.seller_user_id
                 WHERE l.status <> 'rejected'
                 ORDER BY CASE l.status WHEN 'pending_review' THEN 0 ELSE 1 END, l.created_at DESC
                 LIMIT 100`,
            );
            json(res, 200, { marketplace: rows });
            return;
        }

        if (view === 'people') {
            const [users, waitlist] = await Promise.all([
                pool.query(
                    `SELECT u.id, u.email, u.name, u.created_at AS "createdAt",
                            u.payouts_enabled AS "payoutsEnabled",
                            (SELECT count(*)::int FROM marketplace_listings l WHERE l.seller_user_id = u.id) AS listings,
                            (SELECT count(*)::int FROM marketplace_orders o WHERE o.buyer_user_id = u.id) AS purchases
                     FROM users u ORDER BY u.created_at DESC LIMIT 200`,
                ),
                pool.query('SELECT email, source, created_at AS "createdAt" FROM waitlist ORDER BY created_at DESC LIMIT 200'),
            ]);
            json(res, 200, { users: users.rows, waitlist: waitlist.rows });
            return;
        }

        if (view === 'listings') {
            // Submissions publish without review, so moderation happens here
            // after the fact rather than in a queue beforehand.
            const search = clean(typeof req.query.q === 'string' ? req.query.q : '', 80);
            const source = clean(typeof req.query.source === 'string' ? req.query.source : '', 60);
            const filter = clean(typeof req.query.filter === 'string' ? req.query.filter : '', 20) || 'live';
            const status = filter === 'removed' ? 'rejected' : 'live';

            const { rows } = await pool.query(
                `SELECT d.id, d.name, d.tagline, d.url, d.category, d.source, d.source_url AS "sourceUrl",
                        d.featured, d.featured_rank AS "featuredRank", d.status,
                        d.contact_email AS "contactEmail", d.contact_kind AS "contactKind",
                        d.discovered_at AS "discoveredAt", s.email AS "submitterEmail"
                 FROM directory_entries d
                 LEFT JOIN project_submissions s ON s.published_entry_id = d.id
                 WHERE d.status = $3
                   AND ($1 = '' OR d.name ILIKE '%' || $1 || '%' OR d.tagline ILIKE '%' || $1 || '%')
                   AND ($2 = '' OR d.source = $2)
                   AND ($4 = false OR d.featured)
                 ORDER BY d.featured DESC, d.featured_rank ASC, d.discovered_at DESC
                 LIMIT 100`,
                [search, source, status, filter === 'featured'],
            );
            json(res, 200, { listings: rows });
            return;
        }

        const { rows } = await pool.query(
            `SELECT id, product, url, promise, email, status, submitted_at AS "submittedAt"
             FROM project_submissions WHERE status = 'new'
             ORDER BY submitted_at ASC LIMIT 200`,
        );
        json(res, 200, { submissions: rows });
        return;
    }

    const body = (req.body || {}) as {
        id?: string; orderId?: string; action?: string;
        name?: string; tagline?: string; category?: string; rank?: number | string;
    };
    const action = clean(body.action, 20);

    if (action === 'run-ingest' || action === 'run-digest' || action === 'run-contacts') {
        // Proxied server-side so the browser never holds CRON_SECRET.
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            error(res, 501, 'CRON_SECRET is not configured, so scheduled jobs cannot be run.');
            return;
        }
        const base = process.env.PUBLIC_SITE_URL || 'https://freshsaas.online';
        const task = action === 'run-digest' ? '?task=digest' : action === 'run-contacts' ? '?task=contacts' : '';
        const response = await fetch(`${base}/api/cron/ingest${task}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cronSecret}` },
        });
        const payload = await response.json().catch(() => ({}));
        json(res, response.ok ? 200 : 502, payload);
        return;
    }

    if (action === 'listing-approve' || action === 'listing-reject') {
        const listingId = clean(body.id, 64);
        if (!listingId) {
            error(res, 400, 'Provide the marketplace listing id');
            return;
        }
        const nextStatus = action === 'listing-approve' ? 'live' : 'rejected';
        const updated = await pool.query(
            `UPDATE marketplace_listings SET status = $2 WHERE id = $1 RETURNING name, status`,
            [listingId, nextStatus],
        );
        if (!updated.rows[0]) {
            error(res, 404, 'Marketplace listing not found');
            return;
        }
        json(res, 200, { ok: true, name: updated.rows[0].name, status: updated.rows[0].status });
        return;
    }

    if (action === 'feature' || action === 'unfeature') {
        const entryId = clean(body.id, 64);
        if (!entryId) {
            error(res, 400, 'Provide the listing id');
            return;
        }
        const rank = Math.max(0, Math.min(999, Math.round(Number(body.rank) || 0)));
        const updated = await pool.query(
            `UPDATE directory_entries SET featured = $2, featured_rank = $3
             WHERE id = $1 AND status = 'live' RETURNING name, featured`,
            [entryId, action === 'feature', action === 'feature' ? rank : 0],
        );
        if (!updated.rows[0]) {
            error(res, 404, 'Listing not found or not live');
            return;
        }
        json(res, 200, { ok: true, name: updated.rows[0].name, featured: updated.rows[0].featured });
        return;
    }

    if (action === 'edit') {
        const entryId = clean(body.id, 64);
        const name = clean(body.name, 120);
        const tagline = clean(body.tagline, 200);
        const category = clean(body.category, 60);
        if (!entryId || !name || !tagline) {
            error(res, 400, 'Provide the listing id, a name and a tagline');
            return;
        }
        const updated = await pool.query(
            `UPDATE directory_entries
             SET name = $2, tagline = $3, category = COALESCE(NULLIF($4, ''), category)
             WHERE id = $1 RETURNING name`,
            [entryId, name, tagline, category],
        );
        if (!updated.rows[0]) {
            error(res, 404, 'Listing not found');
            return;
        }
        json(res, 200, { ok: true, name: updated.rows[0].name });
        return;
    }

    if (action === 'restore') {
        const entryId = clean(body.id, 64);
        if (!entryId) {
            error(res, 400, 'Provide the listing id');
            return;
        }
        const restored = await pool.query(
            `UPDATE directory_entries SET status = 'live' WHERE id = $1 AND status = 'rejected' RETURNING name`,
            [entryId],
        );
        if (!restored.rows[0]) {
            error(res, 404, 'Listing not found or already live');
            return;
        }
        json(res, 200, { ok: true, restored: restored.rows[0].name });
        return;
    }

    if (action === 'unpublish') {
        const entryId = clean(body.id, 64);
        if (!entryId) {
            error(res, 400, 'Provide the listing id to remove');
            return;
        }
        // Marked rejected rather than deleted, so the dedup key survives and
        // the same entry can't be re-added by the next ingest run.
        const removed = await pool.query(
            `UPDATE directory_entries SET status = 'rejected' WHERE id = $1 AND status = 'live' RETURNING name`,
            [entryId],
        );
        if (!removed.rows[0]) {
            error(res, 404, 'Listing not found or already removed');
            return;
        }
        json(res, 200, { ok: true, removed: removed.rows[0].name });
        return;
    }

    if (action === 'release') {
        await releaseOrder(pool, clean(body.orderId, 64), res);
        return;
    }
    if (action === 'approve' || action === 'reject') {
        await reviewSubmission(pool, clean(body.id, 64), action, res);
        return;
    }
    error(res, 400, "Provide an action of 'approve', 'reject' or 'release'");
}

/** Pays the seller their share once the asset handover is confirmed. */
async function releaseOrder(pool: ReturnType<typeof getPool>, orderId: string, res: VercelResponse): Promise<void> {
    const stripe = getStripe();
    if (!stripe) {
        error(res, 501, 'Payments are not configured on this deployment yet.');
        return;
    }
    if (!orderId) {
        error(res, 400, 'Provide an orderId');
        return;
    }

    const found = await pool.query(
        `SELECT o.id, o.seller_payout_cents, o.payment_state, o.stripe_transfer_id,
                u.stripe_account_id, u.payouts_enabled
         FROM marketplace_orders o
         JOIN marketplace_listings l ON l.id = o.listing_id
         LEFT JOIN users u ON u.id = l.seller_user_id
         WHERE o.id = $1`,
        [orderId],
    );
    const order = found.rows[0];
    if (!order) {
        error(res, 404, 'Order not found');
        return;
    }
    if (order.stripe_transfer_id) {
        json(res, 200, { ok: true, alreadyReleased: true, transferId: order.stripe_transfer_id });
        return;
    }
    if (order.payment_state !== 'paid_held') {
        error(res, 409, `Order is '${order.payment_state}', so there is nothing held to release.`);
        return;
    }
    if (!order.stripe_account_id || !order.payouts_enabled) {
        error(res, 409, 'Seller cannot receive payouts yet; they need to finish Stripe onboarding first.');
        return;
    }

    const transfer = await stripe.transfers.create({
        amount: order.seller_payout_cents,
        currency: 'usd',
        destination: order.stripe_account_id,
        transfer_group: `order_${orderId}`,
        metadata: { orderId },
    }, {
        // A retry after a timeout must not pay the seller a second time.
        idempotencyKey: `release_${orderId}`,
    });

    await pool.query(
        `UPDATE marketplace_orders
         SET payment_state = 'released', status = 'completed', stripe_transfer_id = $2, released_at = now()
         WHERE id = $1`,
        [orderId, transfer.id],
    );

    json(res, 200, { ok: true, released: true, transferId: transfer.id, amountCents: order.seller_payout_cents });
}

/** Approving publishes the submission to the live directory and tells the founder. */
async function reviewSubmission(
    pool: ReturnType<typeof getPool>,
    id: string,
    action: 'approve' | 'reject',
    res: VercelResponse,
): Promise<void> {
    if (!id) {
        error(res, 400, 'Provide a submission id');
        return;
    }

    const found = await pool.query(
        `SELECT id, product, url, promise, email, status, published_entry_id
         FROM project_submissions WHERE id = $1`,
        [id],
    );
    const submission = found.rows[0];
    if (!submission) {
        error(res, 404, 'Submission not found');
        return;
    }
    if (submission.published_entry_id) {
        json(res, 200, { ok: true, alreadyPublished: true });
        return;
    }

    if (action === 'reject') {
        await pool.query(`UPDATE project_submissions SET status = 'rejected', reviewed_at = now() WHERE id = $1`, [id]);
        json(res, 200, { ok: true, status: 'rejected' });
        return;
    }

    const added = await insertCandidates(pool, [{
        name: submission.product,
        tagline: submission.promise,
        description: `${submission.promise}. Submitted by its founder to FreshSAAS.`,
        url: submission.url,
        category: 'Founder submission',
        tags: ['Founder submission', 'New launch'],
        source: 'FreshSAAS submission',
        sourceUrl: submission.url,
        status: 'live',
    }]);

    // insertCandidates skips duplicates, so resolve the row either way to keep
    // approval idempotent.
    const entry = await pool.query('SELECT id FROM directory_entries WHERE dedup_key = $1', [
        dedupKey(submission.product, submission.url),
    ]);
    const entryId = entry.rows[0]?.id ?? null;

    await pool.query(
        `UPDATE project_submissions SET status = 'approved', reviewed_at = now(), published_entry_id = $2 WHERE id = $1`,
        [id, entryId],
    );

    // Only on the run that actually published, so re-approving doesn't email twice.
    if (added > 0 && submission.email) {
        await sendListedEmail(submission.email, submission.product, submission.url);
    }

    json(res, 200, { ok: true, status: 'approved', published: added > 0, entryId });
}
