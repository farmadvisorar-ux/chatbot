import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { guarded } from './_lib/errors.js';
import { getStripe, siteOrigin, shippingFlatCents } from './_lib/stripe.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { isUuid, clean, validEmail } from './_lib/validate.js';
import { mergeCartLines, subtotalCents, MAX_LINE_ITEMS } from './_lib/cart.js';

/**
 * POST /api/checkout {items: [{variantId, quantity}], email?}
 *
 * Creates the order as `awaiting_payment` and opens a Stripe Checkout
 * Session for it. Prices are never taken from the request — every unit price
 * charged comes from product_variants, looked up server-side, so a tampered
 * client payload can change what's in the cart but never what it costs.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('checkout', res, async () => {
        if (!requireMethod(req, res, ['POST'])) return;

        const stripe = getStripe();
        if (!stripe) {
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

        const parsed: { variantId: string; quantity: number }[] = [];
        for (const entry of rawItems) {
            const variantId = (entry as { variantId?: unknown } | null)?.variantId;
            const quantity = (entry as { quantity?: unknown } | null)?.quantity;
            if (!isUuid(variantId)) continue;
            parsed.push({ variantId, quantity: Number(quantity) });
        }
        const lines = mergeCartLines(parsed);
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

        const shippingCents = shippingFlatCents();
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
        let session;
        try {
            session = await stripe.checkout.sessions.create({
                mode: 'payment',
                line_items: orderItems.map(item => ({
                    quantity: item.quantity,
                    price_data: {
                        currency: 'usd',
                        unit_amount: item.unitPriceCents,
                        product_data: { name: item.name },
                    },
                })),
                shipping_address_collection: { allowed_countries: ['US'] },
                shipping_options: [{
                    shipping_rate_data: {
                        type: 'fixed_amount',
                        fixed_amount: { amount: shippingCents, currency: 'usd' },
                        display_name: 'Standard Shipping',
                    },
                }],
                customer_email: email || undefined,
                success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${origin}/`,
                metadata: { orderId },
            });
        } catch (err) {
            await pool.query(
                `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'awaiting_payment'`,
                [orderId],
            );
            throw err;
        }

        if (!session.url) {
            await pool.query(
                `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'awaiting_payment'`,
                [orderId],
            );
            error(res, 502, 'Stripe did not return a checkout URL');
            return;
        }

        await pool.query('UPDATE orders SET stripe_session_id = $2 WHERE id = $1', [orderId, session.id]);

        json(res, 200, { url: session.url, orderId });
    });
}
