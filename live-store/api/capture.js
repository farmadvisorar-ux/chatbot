import { isConfigured, accessToken, paypal, json } from './_paypal.js';
import { isDatabaseConfigured, ensureSchema, sql, claimEdition } from './_db.js';

/** Card #1 in the collectible series. Bump this when the next design ships. */
const CARD_NUMBER = 1;
const PRODUCT_NAME = 'I Hope The Worst Tee';

/**
 * Best-effort: a buyer has already paid by the time this runs, so a database
 * hiccup must never turn into a payment-confirmation error. Failing closed
 * here would mean charging someone and then telling them it failed.
 */
async function claimEditionSafely(paypalOrderId) {
    if (!isDatabaseConfigured()) return null;
    try {
        await ensureSchema();
        const claim = await claimEdition(sql(), {
            paypalOrderId,
            productName: PRODUCT_NAME,
            cardNumber: CARD_NUMBER,
        });
        if (!claim) return null;
        return { number: claim.edition, limit: 200, token: claim.token };
    } catch (err) {
        console.error('[capture] edition claim failed', err);
        return null;
    }
}

/**
 * POST /api/capture { paypalOrderId } -> { status, edition }
 *
 * Called when PayPal redirects the buyer back to the store. This is the step
 * that actually takes the money, so it is deliberately strict about what it
 * reports back: only a COMPLETED capture is reported as confirmed.
 *
 * Safe to call twice. A buyer who reloads the return URL, or opens it on a
 * second device, hits ORDER_ALREADY_CAPTURED — that is the same order already
 * paid for, not a new charge, so it is reported as confirmed rather than as an
 * error that would push them to pay again. The edition claim is idempotent
 * for the same reason: a reload returns the same card, not a new one.
 */
export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return json(res, 405, { error: 'Method not allowed. Use POST.' });
        }
        if (!isConfigured()) {
            return json(res, 501, { error: 'Checkout is not configured on this deployment yet.' });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
        const paypalOrderId = String(body.paypalOrderId ?? '').trim();
        if (!paypalOrderId || !/^[A-Z0-9-]{5,64}$/i.test(paypalOrderId)) {
            return json(res, 400, { error: 'Missing or malformed PayPal order id.' });
        }

        const token = await accessToken();

        let capture;
        try {
            capture = await paypal(`/v2/checkout/orders/${paypalOrderId}/capture`, token);
        } catch (err) {
            if (String(err.message).includes('ORDER_ALREADY_CAPTURED')) {
                const edition = await claimEditionSafely(paypalOrderId);
                return json(res, 200, { status: 'COMPLETED', alreadyCaptured: true, edition });
            }
            throw err;
        }

        if (capture.status !== 'COMPLETED') {
            console.error('[capture] unexpected status', capture.status, paypalOrderId);
            return json(res, 409, { error: `PayPal reported this order as ${capture.status}.` });
        }

        const edition = await claimEditionSafely(paypalOrderId);
        return json(res, 200, { status: capture.status, edition });
    } catch (err) {
        console.error('[capture]', err);
        return json(res, 502, { error: 'We could not confirm that payment with PayPal.' });
    }
}
