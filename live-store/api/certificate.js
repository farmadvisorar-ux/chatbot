import { isDatabaseConfigured, ensureSchema, sql, lookupEdition, EDITION_LIMIT, json } from './_db.js';

/**
 * GET /api/certificate?token=<hex> -> card details for the certificate page.
 * Read-only and unauthenticated on purpose: the token itself (128 bits,
 * handed out once per paid order) is the only thing that gates a lookup.
 */
export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            return json(res, 405, { error: 'Method not allowed. Use GET.' });
        }
        if (!isDatabaseConfigured()) {
            return json(res, 501, { error: 'Certificates are not configured on this deployment yet.' });
        }

        const token = String(req.query.token ?? '').trim();
        if (!/^[a-f0-9]{32}$/.test(token)) {
            return json(res, 400, { error: 'Invalid certificate link.' });
        }

        await ensureSchema();
        const record = await lookupEdition(sql(), token);
        if (!record) {
            return json(res, 404, { error: 'No certificate found for this link.' });
        }

        return json(res, 200, {
            edition: record.edition_number,
            limit: EDITION_LIMIT,
            card: record.card_number,
            product: record.product_name,
            rarity: record.edition_number <= 50 ? 'Ultra Rare' : 'First Edition',
            issued: record.created_at,
        });
    } catch (err) {
        console.error('[certificate]', err);
        return json(res, 500, { error: 'Could not look up that certificate.' });
    }
}
