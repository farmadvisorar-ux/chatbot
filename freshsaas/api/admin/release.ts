import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { clean } from '../_lib/validate.js';
import { getStripe } from '../_lib/stripe.js';

/**
 * Pays the seller after the asset handover is confirmed.
 *
 *   GET  -> orders that are paid and awaiting release
 *   POST -> {orderId} transfers the seller's share to their Connect account
 *
 * Until this runs the buyer's money sits in the platform balance, which is the
 * point: it gives you a window to confirm the domain, code and accounts
 * actually changed hands before the seller can be paid.
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

    const stripe = getStripe();
    if (!stripe) {
        error(res, 501, 'Payments are not configured on this deployment yet.');
        return;
    }
    const pool = getPool();

    if (req.method === 'GET') {
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

    const orderId = clean((req.body as { orderId?: string } | undefined)?.orderId, 64);
    if (!orderId) {
        error(res, 400, 'Provide an orderId');
        return;
    }

    const found = await pool.query(
        `SELECT o.id, o.seller_payout_cents, o.payment_state, o.stripe_transfer_id, o.stripe_payment_intent_id,
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
        // Stripe drops a repeat with the same key, so a retry after a timeout
        // cannot pay the seller twice.
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
