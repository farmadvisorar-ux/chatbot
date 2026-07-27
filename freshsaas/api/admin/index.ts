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

        const { rows } = await pool.query(
            `SELECT id, product, url, promise, email, status, submitted_at AS "submittedAt"
             FROM project_submissions WHERE status = 'new'
             ORDER BY submitted_at ASC LIMIT 200`,
        );
        json(res, 200, { submissions: rows });
        return;
    }

    const body = (req.body || {}) as { id?: string; orderId?: string; action?: string };
    const action = clean(body.action, 20);

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
