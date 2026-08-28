import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod } from './_lib/http.js';
import { guarded } from './_lib/errors.js';
import { capturePayPalOrder, isPayPalConfigured } from './_lib/paypal.js';
import { clean } from './_lib/validate.js';
import { submitToPrintful } from './_lib/fulfillment.js';

/**
 * POST /api/capture { paypalOrderId }
 *
 * Called by the success page after PayPal redirects back. Captures the
 * approved PayPal order, marks the DB order as paid, and kicks off Printful
 * fulfillment. Idempotent: if the order is already paid it just returns the
 * order without calling PayPal again.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('capture', res, async () => {
        if (!requireMethod(req, res, ['POST'])) return;

        if (!isPayPalConfigured()) {
            error(res, 501, 'Checkout is not configured yet');
            return;
        }
        if (!isDatabaseConfigured()) {
            error(res, 501, 'The store is not set up yet');
            return;
        }

        const body = req.body as { paypalOrderId?: unknown } | undefined;
        const paypalOrderId = clean(body?.paypalOrderId, 200);
        if (!paypalOrderId) {
            error(res, 400, 'Missing paypalOrderId');
            return;
        }

        const pool = getPool();
        const { rows } = await pool.query<{
            id: string; status: string; email: string | null;
            subtotalCents: number; shippingCents: number; totalCents: number;
            shippingName: string | null; shippingAddress: object | null;
            trackingNumber: string | null; trackingUrl: string | null; createdAt: string;
        }>(
            `SELECT id, status, email, subtotal_cents AS "subtotalCents",
                    shipping_cents AS "shippingCents", total_cents AS "totalCents",
                    shipping_name AS "shippingName", shipping_address AS "shippingAddress",
                    tracking_number AS "trackingNumber", tracking_url AS "trackingUrl",
                    created_at AS "createdAt"
             FROM orders WHERE paypal_order_id = $1`,
            [paypalOrderId],
        );
        const order = rows[0];
        if (!order) {
            error(res, 404, 'Order not found');
            return;
        }

        if (order.status === 'awaiting_payment') {
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
            if (rowCount) {
                order.status = 'paid';
                order.shippingName = shippingName;
                order.shippingAddress = shippingAddress;
                if (!order.email) order.email = payerEmail;
                await submitToPrintful(pool, order.id);
            }
        }

        const { rows: items } = await pool.query<{ name: string; quantity: number; unitPriceCents: number }>(
            `SELECT name, quantity, unit_price_cents AS "unitPriceCents"
             FROM order_items WHERE order_id = $1 ORDER BY created_at`,
            [order.id],
        );

        json(res, 200, { order: { ...order, items } });
    });
}
