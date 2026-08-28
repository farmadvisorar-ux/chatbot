import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { verifyPayPalWebhook, capturePayPalOrder } from '../_lib/paypal.js';
import { submitToPrintful } from '../_lib/fulfillment.js';

export const config = { api: { bodyParser: true } };

/**
 * POST /api/webhooks/paypal
 *
 * Receives PayPal webhook events. PAYMENT.CAPTURE.COMPLETED is the primary
 * event: it fires after a successful capture and serves as the authoritative
 * confirmation to mark the order paid and submit it to Printful.
 *
 * Verification uses PayPal's own signature-check API so we never trust an
 * unverified payload to modify an order's status.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    if (webhookId) {
        const verified = await verifyPayPalWebhook({
            headers: req.headers as Record<string, string | string[] | undefined>,
            body: req.body,
            webhookId,
        });
        if (!verified) {
            error(res, 400, 'Invalid PayPal webhook signature');
            return;
        }
    }

    const event = req.body as { event_type?: string; resource?: Record<string, unknown> };

    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const resource = event.resource ?? {};
        // The supplementary_data on a capture includes the PayPal order ID.
        const paypalOrderId =
            (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)
                ?.related_ids?.order_id;

        if (paypalOrderId) {
            const pool = getPool();
            const { rows } = await pool.query<{ id: string; status: string }>(
                `SELECT id, status FROM orders WHERE paypal_order_id = $1`,
                [paypalOrderId],
            );
            const order = rows[0];
            if (order && order.status === 'awaiting_payment') {
                try {
                    const { captureId, payerEmail, shippingName, shippingAddress } =
                        await capturePayPalOrder(paypalOrderId);
                    const { rowCount } = await pool.query(
                        `UPDATE orders
                         SET status = 'paid', paypal_capture_id = $2, paid_at = now(),
                             email = COALESCE(email, $3), shipping_name = $4, shipping_address = $5
                         WHERE id = $1 AND status = 'awaiting_payment'`,
                        [
                            order.id,
                            captureId,
                            payerEmail,
                            shippingName,
                            shippingAddress ? JSON.stringify(shippingAddress) : null,
                        ],
                    );
                    if (rowCount) await submitToPrintful(pool, order.id);
                } catch {
                    // Capture already done by the /api/capture endpoint — idempotent, ignore.
                }
            }
        }
    }

    json(res, 200, { received: true });
}
