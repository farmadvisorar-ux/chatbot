import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

/**
 * Neon over HTTP rather than the Postgres wire protocol.
 *
 * Serverless functions open a connection per invocation and are killed without
 * warning, which is exactly the pattern connection pools handle worst. The
 * HTTP driver has no connection to leak, and it works from networks that block
 * port 5432 — which is how this database had to be migrated in the first place.
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    event TEXT NOT NULL,
    session_id TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    path TEXT,
    referrer_host TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    device TEXT,
    browser TEXT,
    os TEXT,
    screen_w INTEGER,
    props JSONB
)`;

const INDEXES = [
    'CREATE INDEX IF NOT EXISTS analytics_ts ON analytics_events (ts DESC)',
    'CREATE INDEX IF NOT EXISTS analytics_event_ts ON analytics_events (event, ts DESC)',
    'CREATE INDEX IF NOT EXISTS analytics_session ON analytics_events (session_id, ts)',
    'CREATE INDEX IF NOT EXISTS analytics_visitor ON analytics_events (visitor_hash, ts)',
];

/**
 * Creates the table on first use. One attempt per warm instance: a cold start
 * retries after a transient failure, but a database that keeps refusing will
 * not be hammered by every request the instance serves.
 */
let ensured = false;
export async function ensureSchema() {
    if (ensured) return;
    ensured = true;
    const db = sql();
    await db(SCHEMA);
    for (const index of INDEXES) await db(index);
}

/**
 * A visitor identifier that is not a tracking identity.
 *
 * The IP address is never stored. It is hashed together with the user agent,
 * the current UTC date and a secret, so the value distinguishes visitors
 * within a day and becomes meaningless the next — enough to count people
 * without following them, and no cookie or consent banner is required for it.
 */
export function visitorHash(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim()
        || req.socket?.remoteAddress || 'unknown';
    const salt = process.env.ANALYTICS_SALT || process.env.ADMIN_SECRET || 'tooiicy';
    const day = new Date().toISOString().slice(0, 10);
    return createHash('sha256')
        .update(`${day}|${ip}|${req.headers['user-agent'] || ''}|${salt}`)
        .digest('hex')
        .slice(0, 32);
}

/** Coarse device/browser/OS buckets. Deliberately not a fingerprint. */
export function parseAgent(ua = '') {
    const s = String(ua);
    const device = /iPad|Tablet/i.test(s) ? 'tablet'
        : /Mobi|Android|iPhone/i.test(s) ? 'mobile'
            : 'desktop';
    const browser = /Edg\//.test(s) ? 'Edge'
        : /OPR\/|Opera/.test(s) ? 'Opera'
            : /Chrome\//.test(s) ? 'Chrome'
                : /Safari\//.test(s) ? 'Safari'
                    : /Firefox\//.test(s) ? 'Firefox'
                        : 'Other';
    const os = /Windows/.test(s) ? 'Windows'
        : /iPhone|iPad|iOS/.test(s) ? 'iOS'
            : /Mac OS X/.test(s) ? 'macOS'
                : /Android/.test(s) ? 'Android'
                    : /Linux/.test(s) ? 'Linux'
                        : 'Other';
    return { device, browser, os };
}

/** Only the host: a full referrer URL can carry someone's search terms. */
export function referrerHost(referrer) {
    if (!referrer) return null;
    try {
        const host = new URL(referrer).hostname.replace(/^www\./, '');
        return host === 'www.tooiicy.com' || host === 'tooiicy.com' ? null : host;
    } catch {
        return null;
    }
}

export function isAdmin(req) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return false;
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '');
    const key = typeof req.query?.key === 'string' ? req.query.key : '';
    return token === secret || key === secret;
}

export function json(res, status, data) {
    res.status(status).json(data);
}
