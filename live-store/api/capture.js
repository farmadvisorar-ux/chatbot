import { isConfigured, accessToken, paypal, json } from './_paypal.js';

/**
 * POST /api/capture { paypalOrderId } -> { status }
 *
 * Called when PayPal redirects the buyer back to the store. This is the step
 * that actually takes the money, so it is deliberately strict about what it
 * reports back: only a COMPLETED capture is reported as confirmed.
 *
 * Safe to call twice. A buyer who reloads the return URL, or opens it on a
 * second device, hits ORDER_ALREADY_CAPTURED — that is the same order already
 * paid for, not a new charge, so it is reported as confirmed rather than as an
 * error that would push them to pay again.
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
                return json(res, 200, { status: 'COMPLETED', alreadyCaptured: true });
            }
            throw err;
        }

        if (capture.status !== 'COMPLETED') {
            console.error('[capture] unexpected status', capture.status, paypalOrderId);
            return json(res, 409, { error: `PayPal reported this order as ${capture.status}.` });
        }

        return json(res, 200, { status: capture.status });
    } catch (err) {
        console.error('[capture]', err);
        return json(res, 502, { error: 'We could not confirm that payment with PayPal.' });
    }
}
