import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, requireMethod } from './_lib/http.js';
import { guarded } from './_lib/errors.js';

/**
 * GET /api/social-links -> active social links for storefront
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('social-links', res, async () => {
        if (!requireMethod(req, res, ['GET'])) return;
        if (!isDatabaseConfigured()) {
            json(res, 200, { socialLinks: [] });
            return;
        }

        const pool = getPool();
        const { rows } = await pool.query(
            `SELECT id, platform, url, sort_order AS "sortOrder"
             FROM social_links WHERE active = true ORDER BY sort_order, created_at`,
        );

        json(res, 200, { socialLinks: rows });
    });
}
