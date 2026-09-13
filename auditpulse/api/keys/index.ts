import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../_lib/http.js';
import { clean, isUuid } from '../_lib/validate.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { tierForUser } from '../_lib/tier.js';
import { generateKey } from '../_lib/apiKeys.js';

/** A ceiling high enough that nobody hits it legitimately, low enough that a compromised session can't fill the table. */
const MAX_LIVE_KEYS = 20;

/**
 * Growth REST API credentials.
 *
 *   GET             -> list this account's keys (prefixes only — never the keys)
 *   POST            -> mint a key; the plaintext is in this response and nowhere else
 *   DELETE ?id=...  -> revoke one
 *
 * Keys can only be managed from a browser session. Allowing a key to mint
 * further keys would turn one leaked credential into permanent, self-renewing
 * access that revoking the original would not close.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;

    const user = await requireAuth(req, res);
    if (!user) return;

    if (user.viaApiKey) {
        error(res, 403, 'API keys can only be managed while signed in to the dashboard.');
        return;
    }

    const pool = getPool();
    const limits = await tierForUser(pool, user.userId);
    if (!limits.apiAccess) {
        error(res, 402, 'The REST API is part of the Growth plan.');
        return;
    }

    if (req.method === 'POST') {
        await createKey(req, res, pool, user.userId);
        return;
    }
    if (req.method === 'DELETE') {
        await revokeKey(req, res, pool, user.userId);
        return;
    }
    await listKeys(res, pool, user.userId);
}

async function listKeys(res: VercelResponse, pool: ReturnType<typeof getPool>, userId: string): Promise<void> {
    const { rows } = await pool.query(
        `SELECT id, name, prefix, created_at, last_used_at, revoked_at
           FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
    );
    json(res, 200, { keys: rows });
}

async function createKey(req: VercelRequest, res: VercelResponse, pool: ReturnType<typeof getPool>, userId: string): Promise<void> {
    const name = clean(req.body?.name, 80) || 'API key';

    const { rows: live } = await pool.query(
        'SELECT count(*)::int AS count FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
    );
    if (live[0].count >= MAX_LIVE_KEYS) {
        error(res, 400, `You already have ${MAX_LIVE_KEYS} active keys. Revoke one before creating another.`);
        return;
    }

    const key = generateKey();
    const { rows } = await pool.query(
        `INSERT INTO api_keys (user_id, name, prefix, token_hash) VALUES ($1, $2, $3, $4)
         RETURNING id, name, prefix, created_at`,
        [userId, name, key.prefix, key.tokenHash],
    );

    // The only time the plaintext key exists outside the caller's own copy.
    // Nothing logs it, and no later request can read it back.
    json(res, 201, { key: { ...rows[0], token: key.token } });
}

async function revokeKey(req: VercelRequest, res: VercelResponse, pool: ReturnType<typeof getPool>, userId: string): Promise<void> {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) {
        error(res, 400, 'Which key? Pass ?id=');
        return;
    }
    if (!isUuid(id)) {
        error(res, 404, 'Key not found, or already revoked.');
        return;
    }

    // Revoking is idempotent but must still 404 for a key belonging to someone
    // else, so the row is matched on user_id rather than filtered afterwards.
    const { rowCount } = await pool.query(
        'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
        [id, userId],
    );
    if (!rowCount) {
        error(res, 404, 'Key not found, or already revoked.');
        return;
    }
    json(res, 200, { revoked: true });
}
