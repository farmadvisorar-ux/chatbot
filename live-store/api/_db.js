import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

/**
 * Same database the analytics project uses — one small extra table costs
 * nothing on Neon, and a second database would just be a second thing to
 * configure. Reached over HTTP for the same reason analytics does: a
 * serverless function has no business holding a pooled connection open
 * between invocations.
 */
const URL_VARS = ['DATABASE_URL', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING'];

export function databaseUrl() {
    for (const name of URL_VARS) {
        if (process.env[name]) return process.env[name];
    }
    return null;
}

export function isDatabaseConfigured() {
    return databaseUrl() !== null;
}

let cached = null;
export function sql() {
    const url = databaseUrl();
    if (!url) throw new Error(`No database URL. Set one of: ${URL_VARS.join(', ')}`);
    if (!cached) cached = neon(url);
    return cached;
}

const SEQUENCE = `CREATE SEQUENCE IF NOT EXISTS edition_seq START 1`;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS editions (
    id BIGSERIAL PRIMARY KEY,
    edition_number INTEGER NOT NULL UNIQUE,
    card_number INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    paypal_order_id TEXT NOT NULL UNIQUE,
    certificate_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

let ensured = false;
export async function ensureSchema() {
    if (ensured) return;
    ensured = true;
    const db = sql();
    await db(SEQUENCE);
    await db(SCHEMA);
}

/** How many First Edition cards a single card design is capped at. */
export const EDITION_LIMIT = 200;

/**
 * Assigns the next edition number to a paid order, once. Idempotent: a buyer
 * who reloads the PayPal return URL calls this again for the same order and
 * gets back the same card instead of burning a second number.
 *
 * The nextval() is gated inside the INSERT...SELECT so a sold-out request
 * never leaves a partial row behind — it just returns null. Numbers can still
 * end up with small gaps if a claim loses the ON CONFLICT race, which is fine
 * for a collectible: it never reuses or duplicates a number, it just never
 * promises the sequence is gapless.
 */
export async function claimEdition(db, { paypalOrderId, productName, cardNumber }) {
    const existing = await db`
        SELECT edition_number, certificate_token FROM editions
        WHERE paypal_order_id = ${paypalOrderId} LIMIT 1
    `;
    if (existing.length) {
        return { edition: existing[0].edition_number, token: existing[0].certificate_token };
    }

    const token = crypto.randomBytes(16).toString('hex');
    const claimed = await db`
        WITH next AS (SELECT nextval('edition_seq') AS n)
        INSERT INTO editions (edition_number, card_number, product_name, paypal_order_id, certificate_token)
        SELECT n, ${cardNumber}, ${productName}, ${paypalOrderId}, ${token} FROM next WHERE n <= ${EDITION_LIMIT}
        ON CONFLICT (paypal_order_id) DO NOTHING
        RETURNING edition_number, certificate_token
    `;
    if (!claimed.length) return null;
    return { edition: claimed[0].edition_number, token: claimed[0].certificate_token };
}

export async function lookupEdition(db, token) {
    const rows = await db`
        SELECT edition_number, card_number, product_name, created_at FROM editions
        WHERE certificate_token = ${token} LIMIT 1
    `;
    return rows[0] || null;
}

export function json(res, status, data) {
    res.status(status).json(data);
}
