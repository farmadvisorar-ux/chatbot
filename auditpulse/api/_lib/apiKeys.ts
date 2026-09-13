import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type pg from 'pg';

/**
 * Prefix on every key. Visible in logs, git history and CI output, so it is
 * deliberately greppable: a customer who leaks one should be able to find it
 * with a search for "ap_live_", and so should a secret scanner.
 */
const KEY_PREFIX = 'ap_live_';

/** Characters of the key kept in clear for display ("ap_live_3f9c…"). Enough to tell two keys apart, far too few to guess the rest. */
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 6;

export interface GeneratedKey {
    /** The full key. Returned to the caller once and never recoverable afterwards. */
    token: string;
    prefix: string;
    tokenHash: string;
}

/** SHA-256 of the key, hex. See db/schema.sql for why this is not a slow hash. */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function generateKey(): GeneratedKey {
    // 32 bytes of CSPRNG output, base64url so the whole key is copy-pasteable
    // into a shell, a header, and a CI secret without escaping.
    const token = KEY_PREFIX + randomBytes(32).toString('base64url');
    return { token, prefix: token.slice(0, DISPLAY_PREFIX_LENGTH), tokenHash: hashToken(token) };
}

/** True for anything shaped like one of our keys, so the auth path can tell "API key" from "Clerk session token" before doing any work. */
export function looksLikeApiKey(token: string): boolean {
    return token.startsWith(KEY_PREFIX);
}

export interface ApiKeyOwner {
    userId: string;
    keyId: string;
}

/**
 * Resolves a presented key to its owner, or null.
 *
 * The lookup is by hash, so the comparison the database performs is already
 * against a value an attacker cannot work backwards from; the extra
 * timingSafeEqual below guards the one remaining comparison in our own code.
 * Revoked keys are excluded in SQL rather than checked afterwards, so a
 * revocation takes effect on the next request with no cache to invalidate.
 */
export async function resolveApiKey(pool: pg.Pool, token: string): Promise<ApiKeyOwner | null> {
    const tokenHash = hashToken(token);
    const { rows } = await pool.query(
        'SELECT id, user_id, token_hash FROM api_keys WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;

    const presented = Buffer.from(tokenHash, 'utf8');
    const stored = Buffer.from(row.token_hash, 'utf8');
    if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return null;

    return { userId: row.user_id, keyId: row.id };
}

/**
 * Stamps when a key was last used, for the dashboard's "last used" column and
 * for answering "is this key still in use?" before revoking it.
 *
 * Deliberately not awaited by the auth path and deliberately swallowing its
 * own errors: this is bookkeeping, and a write failure should not turn a
 * valid request into a 500. The second-granularity WHERE keeps a busy key
 * from writing the same row on every single request.
 */
export function touchApiKey(pool: pg.Pool, keyId: string): void {
    pool.query(
        `UPDATE api_keys SET last_used_at = now()
          WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
        [keyId],
    ).catch(err => console.error('Could not stamp API key usage:', err));
}
