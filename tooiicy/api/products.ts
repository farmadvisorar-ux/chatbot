import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, requireMethod } from './_lib/http.js';
import { guarded } from './_lib/errors.js';

/**
 * GET /api/products -> the public catalog: every active product with its
 * variants, in display order. The whole catalog comes back in one call — a
 * merch storefront has a few dozen SKUs at most, not thousands, so paging
 * would be complexity with nothing to page through.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('products', res, async () => {
        if (!requireMethod(req, res, ['GET'])) return;

        if (!isDatabaseConfigured()) {
            json(res, 200, { products: [] });
            return;
        }

        const pool = getPool();
        const { rows: products } = await pool.query<{
            id: string; slug: string; name: string; description: string; imageUrl: string | null;
        }>(
            `SELECT id, slug, name, description, image_url AS "imageUrl"
             FROM products WHERE active = true ORDER BY sort_order, created_at`,
        );

        if (products.length === 0) {
            json(res, 200, { products: [] });
            return;
        }

        const { rows: variants } = await pool.query<{
            id: string; productId: string; name: string; priceCents: number; imageUrl: string | null; inStock: boolean;
        }>(
            `SELECT id, product_id AS "productId", name, price_cents AS "priceCents",
                    image_url AS "imageUrl", in_stock AS "inStock"
             FROM product_variants WHERE product_id = ANY($1) ORDER BY sort_order, created_at`,
            [products.map(p => p.id)],
        );

        const byProduct = new Map<string, typeof variants>();
        for (const variant of variants) {
            const list = byProduct.get(variant.productId) ?? [];
            list.push(variant);
            byProduct.set(variant.productId, list);
        }

        json(res, 200, {
            products: products.map(product => ({
                ...product,
                variants: (byProduct.get(product.id) ?? []).map(({ productId: _productId, ...rest }) => rest),
            })),
        });
    });
}
