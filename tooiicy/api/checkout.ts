import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { guarded } from './_lib/errors.js';
import { isPayPalConfigured, siteOrigin, createPayPalOrder } from './_lib/paypal.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { isUuid, clean, validEmail } from './_lib/validate.js';
import { clampQuantity, subtotalCents, MAX_LINE_ITEMS } from './_lib/cart.js';

type CartLine = { variantId: string; quantity: number };

/**
 * POST /api/checkout {items: [{variantId, quantity}], email?}
 *
 * Creates the order as `awaiting_payment` and opens a PayPal order for it.
 * Prices are never taken from the request — every unit price charged comes
 * from product_variants, looked up server-side.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('checkout', res, async () => {
        if (!requireMethod(req, res, ['POST'])) return;

        if (!isPayPalConfigured()) {
            error(res, 501, 'Checkout is not configured yet');
            return;
        }
        if (!isDatabaseConfigured()) {
            error(res, 501, 'The store is not set up yet');
            return;
        }

        const pool = getPool();
        const allowed = await checkRateLimit(pool, 'checkout', clientKey(req), 20, 10);
        if (!allowed) {
            error(res, 429, 'Too many checkout attempts. Try again in a few minutes.');
            return;
        }

        const body = req.body as { items?: unknown; email?: unknown } | undefined;
        const rawItems = Array.isArray(body?.items) ? body.items : [];
        const email = clean(body?.email, 254);
        if (email && !validEmail(email)) {
            error(res, 400, 'That email address does not look right');
            return;
        }

        const lines: CartLine[] = [];
        for (const entry of rawItems) {
            const variantId = (entry as { variantId?: unknown } | null)?.variantId;
            const quantity = (entry as { quantity?: unknown } | null)?.quantity;
            if (!isUuid(variantId)) continue;
            lines.push({ variantId, quantity: clampQuantity(Number(quantity)) });
        }
        if (lines.length === 0) {
            error(res, 400, 'Your cart is empty');
            return;
        }
        if (lines.length > MAX_LINE_ITEMS) {
            error(res, 400, `A single order can hold at most ${MAX_LINE_ITEMS} items`);
            return;
        }

        const { rows: variants } = await pool.query<{
            id: string; printfulVariantId: string; priceCents: number; inStock: boolean;
            productActive: boolean; productName: string; variantName: string;
        }>(
            `SELECT pv.id, pv.printful_variant_id AS "printfulVariantId", pv.price_cents AS "priceCents",
                    pv.in_stock AS "inStock", p.active AS "productActive", p.name AS "productName",
                    pv.name AS "variantName"
             FROM product_variants pv JOIN products p ON p.id = pv.product_id
             WHERE pv.id = ANY($1)`,
            [lines.map(l => l.variantId)],
        );
        const byId = new Map(variants.map(v => [v.id, v]));

        const unavailable: string[] = [];
        const orderItems: {
            variantId: string; printfulVariantId: number; name: string; quantity: number; unitPriceCents: number;
        }[] = [];
        for (const line of lines) {
            const variant = byId.get(line.variantId);
            if (!variant || !variant.productActive || !variant.inStock) {
                unavailable.push(variant ? `${variant.productName} — ${variant.variantName}` : line.variantId);
                continue;
            }
            orderItems.push({
                variantId: variant.id,
                printfulVariantId: Number(variant.printfulVariantId),
                name: `${variant.productName} — ${variant.variantName}`,
                quantity: line.quantity,
                unitPriceCents: variant.priceCents,
            });
        }
        if (unavailable.length > 0) {
            error(res, 409, `No longer available: ${unavailable.join(', ')}`);
            return;
        }

        const shippingCents = Math.max(0, Math.trunc(Number(process.env.SHIPPING_FLAT_CENTS) || 500));
        const subtotal = subtotalCents(orderItems);
        const total = subtotal + shippingCents;

        const client = await pool.connect();
        let orderId: string;
        try {
            await client.query('BEGIN');
            const { rows } = await client.query<{ id: string }>(
                `INSERT INTO orders (email, subtotal_cents, shipping_cents, total_cents)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [email || null, subtotal, shippingCents, total],
            );
            orderId = rows[0].id;
            for (const item of orderItems) {
                await client.query(
                    `INSERT INTO order_items (order_id, product_variant_id, printful_variant_id, name, quantity, unit_price_cents)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [orderId, item.variantId, item.printfulVariantId, item.name, item.quantity, item.unitPriceCents],
                );
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        const origin = siteOrigin();
        const { orderId: paypalOrderId, approvalUrl } = await createPayPalOrder({
            items: orderItems.map(i => ({ name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
            shippingCents,
            totalCents: total,
            returnUrl: `${origin}/success.html?orderId=${orderId}`,
            cancelUrl: `${origin}/`,
        });

        await pool.query('UPDATE orders SET paypal_order_id = $2 WHERE id = $1', [orderId, paypalOrderId]);

        json(res, 200, { url: approvalUrl, orderId });
    });
}
