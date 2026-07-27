import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { clean, validEmail, validUrl, numberValue } from './_lib/validate.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { checkRateLimit } from './_lib/rateLimit.js';

type ListingBody = {
    name?: string;
    tagline?: string;
    description?: string;
    priceUsd?: string | number;
    sellerEmail?: string;
    url?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const pool = getPool();

    if (req.method === 'GET') {
        const { rows } = await pool.query(
            `SELECT id, name, tagline, description, price_cents AS "priceCents", url, created_at AS "createdAt"
             FROM marketplace_listings WHERE status = 'live' ORDER BY created_at DESC LIMIT 100`,
        );
        json(res, 200, { listings: rows });
        return;
    }

    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    if (!(await checkRateLimit(pool, 'marketplace-listings', clientKey(req), 5, 60))) {
        error(res, 429, 'Too many listing submissions from this network. Try again later.');
        return;
    }

    const input = (req.body || {}) as ListingBody;
    const name = clean(input.name, 120);
    const tagline = clean(input.tagline, 200);
    const description = clean(input.description, 2000);
    const sellerEmail = clean(input.sellerEmail, 254).toLowerCase();
    const url = clean(input.url, 2048);
    const priceUsd = numberValue(input.priceUsd);
    const priceCents = Math.round(priceUsd * 100);

    if (!name || !tagline || !description || !url) {
        error(res, 400, 'Name, tagline, description, and URL are required');
        return;
    }
    if (!validEmail(sellerEmail)) {
        error(res, 400, 'Enter a valid seller email');
        return;
    }
    if (!validUrl(url)) {
        error(res, 400, 'Enter a valid product URL');
        return;
    }
    if (!Number.isFinite(priceCents) || priceCents < 100 || priceCents > 100_000_000) {
        error(res, 400, 'Enter a listing price between $1 and $1,000,000');
        return;
    }

    // New listings require manual review before they go live in the marketplace.
    const inserted = await pool.query(
        `INSERT INTO marketplace_listings (name, tagline, description, price_cents, seller_email, url, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_review') RETURNING id`,
        [name, tagline, description, priceCents, sellerEmail, url],
    );
    if (!inserted.rows[0]) {
        error(res, 500, 'Could not save listing');
        return;
    }
    json(res, 200, { ok: true, listingId: inserted.rows[0].id, status: 'pending_review' });
}
