/**
 * Minimal PayPal REST client for the live storefront.
 *
 * Live mode unless PAYPAL_MODE is explicitly "sandbox", so a missing or
 * misspelled variable fails towards the real API rather than silently taking
 * fake money in a store that looks open for business.
 */
const PAYPAL_API = process.env.PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

let cachedToken = null;

export function isConfigured() {
    return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/** Access tokens last ~9 hours; reused within a warm instance, refreshed a minute early. */
export async function accessToken() {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

    const credentials = Buffer
        .from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`)
        .toString('base64');

    const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error(`PayPal auth failed (${response.status})`);

    const data = await response.json();
    cachedToken = { value: data.access_token, expiresAt: now + data.expires_in * 1000 };
    return cachedToken.value;
}

export async function paypal(path, token, body) {
    const response = await fetch(`${PAYPAL_API}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.message || `PayPal request failed (${response.status})`);
    }
    return payload;
}

/**
 * The origin this request arrived on, so PayPal returns the buyer to the same
 * deployment they left — a preview URL stays on the preview, production stays
 * on production. PUBLIC_SITE_URL overrides it when a custom domain should own
 * the return leg.
 */
export function siteOrigin(req) {
    if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
}

export function json(res, status, data) {
    res.status(status).json(data);
}
