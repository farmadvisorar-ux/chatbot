import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod } from './_lib/http.js';
import { guarded } from './_lib/errors.js';
import { clean } from './_lib/validate.js';

/**
 * GET /api/orders?session_id=cs_... -> the receipt for the success page.
 *
 * The Stripe Checkout Session id doubles as the access token here: it is a
 * long, unguessable string Stripe hands only to the browser that just paid,
 * so knowing it is treated as proof this is that shopper looking up their
 * own order. There is no account system to check a role against instead.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('orders', res, async () => {
        if (!requireMethod(req, res, ['GET'])) return;

        const sessionId = clean(req.query.session_id, 200);
        if (!sessionId) {
            error(res, 400, 'Missing session_id');
            return;
        }
        if (!isDatabaseConfigured()) {
            error(res, 501, 'The store is not set up yet');
            return;
        }

        const pool = getPool();
        const { rows } = await pool.query<{
            id: string; status: string; email: string | null; subtotalCents: number; shippingCents: number;
            totalCents: number; shippingName: string | null;
            shippingAddress: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
            trackingNumber: string | null; trackingUrl: string | null; createdAt: string;
        }>(
            `SELECT id, status, email, subtotal_cents AS "subtotalCents", shipping_cents AS "shippingCents",
                    total_cents AS "totalCents", shipping_name AS "shippingName",
                    shipping_address AS "shippingAddress", tracking_number AS "trackingNumber",
                    tracking_url AS "trackingUrl", created_at AS "createdAt"
             FROM orders WHERE stripe_session_id = $1`,
            [sessionId],
        );
        const order = rows[0];
        if (!order) {
            error(res, 404, 'Order not found');
            return;
        }

        const { rows: items } = await pool.query<{ name: string; quantity: number; unitPriceCents: number }>(
            `SELECT name, quantity, unit_price_cents AS "unitPriceCents" FROM order_items WHERE order_id = $1 ORDER BY created_at`,
            [order.id],
        );

        json(res, 200, { order: { ...order, items } });
    });
}
