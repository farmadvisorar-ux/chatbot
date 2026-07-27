import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { clean, validEmail } from './_lib/validate.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { checkRateLimit } from './_lib/rateLimit.js';

const PLATFORM_FEE_RATE = 0.1;

type OrderBody = { listingId?: string; buyerEmail?: string };

/**
 * Demo checkout only. No payment processor is connected yet, so no money
 * actually moves here — this just records intent and previews the 10%
 * platform fee split so the flow can be wired to real payments later.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const pool = getPool();

    if (!(await checkRateLimit(pool, 'marketplace-orders', clientKey(req), 10, 60))) {
        error(res, 429, 'Too many checkout attempts from this network. Try again later.');
        return;
    }

    const input = (req.body || {}) as OrderBody;
    const listingId = clean(input.listingId, 64);
    const buyerEmail = clean(input.buyerEmail, 254).toLowerCase();

    if (!listingId || !validEmail(buyerEmail)) {
        error(res, 400, 'A listing and a valid buyer email are required');
        return;
    }

    const listingResult = await pool.query(
        `SELECT id, price_cents FROM marketplace_listings WHERE id = $1 AND status = 'live'`,
        [listingId],
    );
    const listing = listingResult.rows[0];
    if (!listing) {
        error(res, 404, 'Listing not found');
        return;
    }

    const priceCents: number = listing.price_cents;
    const platformFeeCents = Math.round(priceCents * PLATFORM_FEE_RATE);
    const sellerPayoutCents = priceCents - platformFeeCents;

    const inserted = await pool.query(
        `INSERT INTO marketplace_orders (listing_id, buyer_email, price_cents, platform_fee_cents, seller_payout_cents, status)
         VALUES ($1, $2, $3, $4, $5, 'stub_pending_payment_integration') RETURNING id`,
        [listingId, buyerEmail, priceCents, platformFeeCents, sellerPayoutCents],
    );
    if (!inserted.rows[0]) {
        error(res, 500, 'Could not record order');
        return;
    }

    json(res, 200, {
        ok: true,
        orderId: inserted.rows[0].id,
        priceCents,
        platformFeeCents,
        sellerPayoutCents,
        live: false,
        message: 'Demo checkout recorded. No payment was charged — connect a payment processor to accept real sales.',
    });
}
