import { sql, ensureSchema, isDatabaseConfigured, visitorHash, parseAgent, referrerHost, json } from './_db.js';

const EVENTS = new Set([
    'page_view', 'view_product', 'select_size', 'add_to_cart',
    'remove_from_cart', 'open_cart', 'begin_checkout', 'purchase',
]);

const str = (value, max) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * POST /api/track — one visitor event.
 *
 * Everything that identifies where a request came from is read server-side
 * (geo headers, user agent, hashed IP) rather than trusted from the body, so a
 * forged payload can add a bogus row but cannot forge a country or impersonate
 * another visitor.
 *
 * Always answers 204, even when the database is missing or the write fails.
 * Analytics must never be the reason a shopper sees an error, and the browser
 * has nothing useful to do with the failure anyway.
 */
export default async function handler(req, res) {
    // The storefront is on another origin, so the response has to say the
    // request was allowed. The beacon is sent as text/plain, which keeps it a
    // "simple" request — no OPTIONS preflight, so one round trip rather than
    // two, and nothing to fail silently on a slow connection.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Origin');

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'Method not allowed. Use POST.' });
    }
    if (!isDatabaseConfigured()) return res.status(204).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});

        const event = str(body.event, 40);
        if (!event || !EVENTS.has(event)) return res.status(204).end();

        const sessionId = str(body.sessionId, 64);
        if (!sessionId) return res.status(204).end();

        const { device, browser, os } = parseAgent(req.headers['user-agent']);
        const screen = Number(body.screenW);

        await ensureSchema();
        await sql()`
            INSERT INTO analytics_events
                (event, session_id, visitor_hash, path, referrer_host,
                 utm_source, utm_medium, utm_campaign,
                 country, region, city, device, browser, os, screen_w, props)
            VALUES (
                ${event}, ${sessionId}, ${visitorHash(req)},
                ${str(body.path, 300)}, ${referrerHost(body.referrer)},
                ${str(body.utmSource, 100)}, ${str(body.utmMedium, 100)}, ${str(body.utmCampaign, 100)},
                ${req.headers['x-vercel-ip-country'] || null},
                ${req.headers['x-vercel-ip-country-region'] || null},
                ${req.headers['x-vercel-ip-city'] ? decodeURIComponent(String(req.headers['x-vercel-ip-city'])) : null},
                ${device}, ${browser}, ${os},
                ${Number.isFinite(screen) && screen > 0 ? Math.min(Math.trunc(screen), 20000) : null},
                ${body.props && typeof body.props === 'object' ? JSON.stringify(body.props).slice(0, 2000) : null}
            )`;
    } catch (err) {
        console.error('[track]', err);
    }
    return res.status(204).end();
}
