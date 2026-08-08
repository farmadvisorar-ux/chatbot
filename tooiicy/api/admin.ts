import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, error, requireMethod, isAdmin } from './_lib/http.js';
import { guarded } from './_lib/errors.js';
import { SCHEMA_SQL } from './_lib/schema.js';
import { clean, isUuid, asPositiveInt } from './_lib/validate.js';
import { submitToPrintful } from './_lib/fulfillment.js';

const ORDER_STATUSES = ['awaiting_payment', 'paid', 'submitted_to_printful', 'fulfillment_error', 'shipped', 'cancelled'];

type VariantInput = { printfulVariantId?: unknown; name?: unknown; priceCents?: unknown; imageUrl?: unknown };

function readVariant(raw: VariantInput): { printfulVariantId: number; name: string; priceCents: number; imageUrl: string } | null {
    const printfulVariantId = asPositiveInt(raw.printfulVariantId);
    const name = clean(raw.name, 200);
    const priceCents = asPositiveInt(raw.priceCents);
    if (!printfulVariantId || !name || !priceCents) return null;
    return { printfulVariantId, name, priceCents, imageUrl: clean(raw.imageUrl, 2048) };
}

/**
 * GET  /api/admin                             -> catalog + recent orders
 * POST /api/admin {action: ..., ...}          -> mutations, listed below
 *
 * Guarded by ADMIN_SECRET rather than a user role — there is no role system
 * yet, and this is honest about that instead of implying per-user permissions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('admin', res, async () => {
        if (!requireMethod(req, res, ['GET', 'POST'])) return;

        if (!process.env.ADMIN_SECRET) {
            error(res, 501, 'Admin access is not configured');
            return;
        }
        if (!isAdmin(req)) {
            error(res, 401, 'Unauthorized');
            return;
        }
        if (!isDatabaseConfigured()) {
            error(res, 501, 'The database is not configured on this deployment yet.');
            return;
        }

        const pool = getPool();
        const body = (req.body ?? {}) as Record<string, unknown>;
        const action = req.method === 'POST' ? clean(body.action, 40) : '';

        // Applies the schema from inside the deployment, where the connection
        // string already lives. Safe to call repeatedly: every statement in
        // the schema is IF NOT EXISTS and there are no DROPs, both asserted in
        // tests/schema.test.mjs.
        if (action === 'migrate') {
            await pool.query(SCHEMA_SQL);
            const { rows } = await pool.query<{ table_name: string }>(
                `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
            );
            json(res, 200, { ok: true, tables: rows.map(row => row.table_name) });
            return;
        }

        if (action === 'create_product') {
            const slug = clean(body.slug, 100).toLowerCase().replace(/[^a-z0-9-]/g, '');
            const name = clean(body.name, 200);
            const description = clean(body.description, 4000);
            const imageUrl = clean(body.imageUrl, 2048);
            const rawVariants = Array.isArray(body.variants) ? body.variants : [];
            const variants = rawVariants.map(v => readVariant(v as VariantInput)).filter(v => v !== null);

            if (!slug || !name || variants.length === 0 || variants.length !== rawVariants.length) {
                error(res, 400, 'A product needs a slug, a name, and at least one valid variant (Printful variant id, name, price).');
                return;
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const { rows } = await client.query<{ id: string }>(
                    `INSERT INTO products (slug, name, description, image_url) VALUES ($1, $2, $3, $4) RETURNING id`,
                    [slug, name, description, imageUrl || null],
                );
                const productId = rows[0].id;
                for (const [index, variant] of variants.entries()) {
                    await client.query(
                        `INSERT INTO product_variants (product_id, printful_variant_id, name, price_cents, image_url, sort_order)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [productId, variant.printfulVariantId, variant.name, variant.priceCents, variant.imageUrl || null, index],
                    );
                }
                await client.query('COMMIT');
                json(res, 200, { ok: true, productId });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
            return;
        }

        if (action === 'update_product') {
            const id = body.id;
            if (!isUuid(id)) {
                error(res, 400, 'Missing or invalid product id');
                return;
            }
            const { rowCount } = await pool.query(
                `UPDATE products SET
                    name = COALESCE($2, name),
                    description = COALESCE($3, description),
                    image_url = COALESCE($4, image_url),
                    active = COALESCE($5, active),
                    sort_order = COALESCE($6, sort_order)
                 WHERE id = $1`,
                [
                    id,
                    typeof body.name === 'string' ? clean(body.name, 200) : null,
                    typeof body.description === 'string' ? clean(body.description, 4000) : null,
                    typeof body.imageUrl === 'string' ? clean(body.imageUrl, 2048) : null,
                    typeof body.active === 'boolean' ? body.active : null,
                    typeof body.sortOrder === 'number' ? Math.trunc(body.sortOrder) : null,
                ],
            );
            if (!rowCount) {
                error(res, 404, 'Product not found');
                return;
            }
            json(res, 200, { ok: true });
            return;
        }

        if (action === 'add_variant') {
            const productId = body.productId;
            const variant = readVariant(body as VariantInput);
            if (!isUuid(productId) || !variant) {
                error(res, 400, 'A variant needs a product id, a Printful variant id, a name, and a price.');
                return;
            }
            const { rowCount } = await pool.query(
                `INSERT INTO product_variants (product_id, printful_variant_id, name, price_cents, image_url)
                 VALUES ($1, $2, $3, $4, $5)`,
                [productId, variant.printfulVariantId, variant.name, variant.priceCents, variant.imageUrl || null],
            );
            json(res, rowCount ? 200 : 500, { ok: !!rowCount });
            return;
        }

        if (action === 'update_variant') {
            const id = body.id;
            if (!isUuid(id)) {
                error(res, 400, 'Missing or invalid variant id');
                return;
            }
            const { rowCount } = await pool.query(
                `UPDATE product_variants SET
                    name = COALESCE($2, name),
                    price_cents = COALESCE($3, price_cents),
                    image_url = COALESCE($4, image_url),
                    in_stock = COALESCE($5, in_stock),
                    sort_order = COALESCE($6, sort_order)
                 WHERE id = $1`,
                [
                    id,
                    typeof body.name === 'string' ? clean(body.name, 200) : null,
                    asPositiveInt(body.priceCents),
                    typeof body.imageUrl === 'string' ? clean(body.imageUrl, 2048) : null,
                    typeof body.inStock === 'boolean' ? body.inStock : null,
                    typeof body.sortOrder === 'number' ? Math.trunc(body.sortOrder) : null,
                ],
            );
            if (!rowCount) {
                error(res, 404, 'Variant not found');
                return;
            }
            json(res, 200, { ok: true });
            return;
        }

        if (action === 'update_order_status') {
            const id = body.id;
            const status = clean(body.status, 40);
            if (!isUuid(id) || !ORDER_STATUSES.includes(status)) {
                error(res, 400, `status must be one of: ${ORDER_STATUSES.join(', ')}`);
                return;
            }
            const { rowCount } = await pool.query('UPDATE orders SET status = $2 WHERE id = $1', [id, status]);
            if (!rowCount) {
                error(res, 404, 'Order not found');
                return;
            }
            json(res, 200, { ok: true });
            return;
        }

        if (action === 'retry_fulfillment') {
            const id = body.orderId;
            if (!isUuid(id)) {
                error(res, 400, 'Missing or invalid order id');
                return;
            }
            const { rows } = await pool.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [id]);
            if (!rows[0]) {
                error(res, 404, 'Order not found');
                return;
            }
            if (!['paid', 'fulfillment_error'].includes(rows[0].status)) {
                error(res, 409, `Order is ${rows[0].status}; only paid or fulfillment_error orders can be retried.`);
                return;
            }
            await submitToPrintful(pool, id);
            const { rows: after } = await pool.query<{ status: string; fulfillmentError: string | null }>(
                `SELECT status, fulfillment_error AS "fulfillmentError" FROM orders WHERE id = $1`,
                [id],
            );
            json(res, 200, { ok: after[0]?.status !== 'fulfillment_error', order: after[0] });
            return;
        }

        if (action === 'create_social_link') {
            const platform = clean(body.platform, 40);
            const url = clean(body.url, 500);
            if (!platform || !url) {
                error(res, 400, 'A social link needs a platform and a URL');
                return;
            }
            const { rows } = await pool.query<{ id: string }>(
                `INSERT INTO social_links (platform, url) VALUES ($1, $2) RETURNING id`,
                [platform, url],
            );
            json(res, 200, { ok: true, id: rows[0].id });
            return;
        }

        if (action === 'update_social_link') {
            const id = body.id;
            if (!isUuid(id)) {
                error(res, 400, 'Missing or invalid social link id');
                return;
            }
            const { rowCount } = await pool.query(
                `UPDATE social_links SET
                    platform = COALESCE($2, platform),
                    url = COALESCE($3, url),
                    active = COALESCE($4, active),
                    sort_order = COALESCE($5, sort_order)
                 WHERE id = $1`,
                [
                    id,
                    typeof body.platform === 'string' ? clean(body.platform, 40) : null,
                    typeof body.url === 'string' ? clean(body.url, 500) : null,
                    typeof body.active === 'boolean' ? body.active : null,
                    typeof body.sortOrder === 'number' ? Math.trunc(body.sortOrder) : null,
                ],
            );
            if (!rowCount) {
                error(res, 404, 'Social link not found');
                return;
            }
            json(res, 200, { ok: true });
            return;
        }

        if (action === 'delete_social_link') {
            const id = body.id;
            if (!isUuid(id)) {
                error(res, 400, 'Missing or invalid social link id');
                return;
            }
            const { rowCount } = await pool.query('DELETE FROM social_links WHERE id = $1', [id]);
            if (!rowCount) {
                error(res, 404, 'Social link not found');
                return;
            }
            json(res, 200, { ok: true });
            return;
        }

        if (req.method === 'GET') {
            const [products, variants, orders, socialLinks] = await Promise.all([
                pool.query(
                    `SELECT id, slug, name, description, image_url AS "imageUrl", active,
                            sort_order AS "sortOrder", created_at AS "createdAt"
                     FROM products ORDER BY sort_order, created_at`,
                ),
                pool.query(
                    `SELECT id, product_id AS "productId", printful_variant_id AS "printfulVariantId", name,
                            price_cents AS "priceCents", image_url AS "imageUrl", in_stock AS "inStock",
                            sort_order AS "sortOrder"
                     FROM product_variants ORDER BY sort_order, created_at`,
                ),
                pool.query<{ id: string }>(
                    `SELECT id, email, status, subtotal_cents AS "subtotalCents", shipping_cents AS "shippingCents",
                            total_cents AS "totalCents", shipping_name AS "shippingName",
                            shipping_address AS "shippingAddress", printful_order_id AS "printfulOrderId",
                            tracking_number AS "trackingNumber", tracking_url AS "trackingUrl",
                            fulfillment_error AS "fulfillmentError", paid_at AS "paidAt", created_at AS "createdAt"
                     FROM orders WHERE status <> 'awaiting_payment' ORDER BY created_at DESC LIMIT 200`,
                ),
                pool.query(
                    `SELECT id, platform, url, active, sort_order AS "sortOrder", created_at AS "createdAt"
                     FROM social_links ORDER BY sort_order, created_at`,
                ),
            ]);

            const orderItems = orders.rows.length
                ? (await pool.query<{ orderId: string; name: string; quantity: number; unitPriceCents: number }>(
                    `SELECT order_id AS "orderId", name, quantity, unit_price_cents AS "unitPriceCents"
                     FROM order_items WHERE order_id = ANY($1) ORDER BY created_at`,
                    [orders.rows.map(o => o.id)],
                )).rows
                : [];
            const itemsByOrder = new Map<string, typeof orderItems>();
            for (const item of orderItems) {
                const list = itemsByOrder.get(item.orderId) ?? [];
                list.push(item);
                itemsByOrder.set(item.orderId, list);
            }

            json(res, 200, {
                products: products.rows,
                variants: variants.rows,
                orders: orders.rows.map(order => ({ ...order, items: itemsByOrder.get(order.id) ?? [] })),
                socialLinks: socialLinks.rows,
            });
            return;
        }

        error(res, 400, 'Unknown action');
    });
}
