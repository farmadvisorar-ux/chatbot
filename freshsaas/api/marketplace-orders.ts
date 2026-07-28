import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { clean } from './_lib/validate.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { requireAuth } from './_lib/auth.js';
import { getStripe, splitAmount, siteOrigin } from './_lib/stripe.js';

type OrderBody = { listingId?: string };

/**
 * Starts a purchase by creating a Stripe Checkout Session.
 *
 * The charge lands in the platform's own balance rather than being forwarded
 * to the seller, and the seller is paid later by an explicit transfer once the
 * asset handover is confirmed (see api/admin/release.ts). For sales of whole
 * products that matters: a destination charge would hand over the money the
 * instant the card cleared, before the buyer received anything.
 *
 * The price always comes from the listing row, never from the request body.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const pool = getPool();

    const user = await requireAuth(req, res);
    if (!user) return;

    const stripe = getStripe();
    if (!stripe) {
        error(res, 501, 'Purchases are not open yet. Join the launch list and we will let you know the moment they are.');
        return;
    }

    if (!(await checkRateLimit(pool, 'marketplace-orders', clientKey(req), 10, 60))) {
        error(res, 429, 'Too many checkout attempts from this network. Try again later.');
        return;
    }

    const listingId = clean((req.body as OrderBody | undefined)?.listingId, 64);
    if (!listingId) {
        error(res, 400, 'A listing is required');
        return;
    }

    const listingResult = await pool.query(
        `SELECT l.id, l.name, l.price_cents, l.seller_user_id, l.seller_email, u.stripe_account_id, u.payouts_enabled
         FROM marketplace_listings l
         LEFT JOIN users u ON u.id = l.seller_user_id
         WHERE l.id = $1 AND l.status = 'live'`,
        [listingId],
    );
    const listing = listingResult.rows[0];
    if (!listing) {
        error(res, 404, 'Listing not found');
        return;
    }
    if (listing.seller_user_id === user.userId) {
        error(res, 400, 'You cannot buy your own listing');
        return;
    }
    // Refuse the sale rather than take money we have no way to pay out.
    if (!listing.stripe_account_id || !listing.payouts_enabled) {
        error(res, 409, 'This seller has not finished payout setup yet, so the listing cannot be purchased.');
        return;
    }

    const priceCents: number = listing.price_cents;
    const { platformFeeCents, sellerPayoutCents } = splitAmount(priceCents);

    const inserted = await pool.query(
        `INSERT INTO marketplace_orders
           (listing_id, buyer_user_id, buyer_email, price_cents, platform_fee_cents, seller_payout_cents, status, payment_state)
         VALUES ($1, $2, $3, $4, $5, $6, 'awaiting_payment', 'awaiting_payment')
         RETURNING id`,
        [listingId, user.userId, user.email, priceCents, platformFeeCents, sellerPayoutCents],
    );
    const orderId = inserted.rows[0]?.id;
    if (!orderId) {
        error(res, 500, 'Could not create the order');
        return;
    }

    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: priceCents,
                product_data: { name: listing.name, description: 'SaaS acquisition via FreshSAAS' },
            },
        }],
        // Order id travels with the session so the webhook can match the
        // payment back to our row without trusting anything from the browser.
        metadata: { orderId, listingId, sellerUserId: listing.seller_user_id },
        success_url: `${siteOrigin()}/?purchase=success`,
        cancel_url: `${siteOrigin()}/?purchase=cancelled`,
    });

    await pool.query('UPDATE marketplace_orders SET stripe_session_id = $2 WHERE id = $1', [orderId, session.id]);

    json(res, 200, {
        ok: true,
        orderId,
        checkoutUrl: session.url,
        priceCents,
        platformFeeCents,
        sellerPayoutCents,
    });
}
