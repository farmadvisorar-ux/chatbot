import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { error } from './http.js';
import { getPool } from './db.js';
import { looksLikeApiKey, resolveApiKey, touchApiKey } from './apiKeys.js';
import { limitsFor } from './tier.js';

export type AuthedUser = {
    userId: string;
    email: string;
    name: string | null;
    /** True when the caller authenticated with an API key rather than a browser session. */
    viaApiKey?: boolean;
};

/**
 * Mirrors the caller into `users` so the row exists before anything
 * references it.
 *
 * The Clerk webhook (api/webhooks/clerk) is the primary sync, but it is a
 * separate piece of dashboard configuration that can be missing, misconfigured,
 * or silently stop delivering — and when it does, every foreign key to
 * users(id) fails and a signed-in person cannot add a site at all. Clerk has
 * already given us the id, email and name by this point, so writing them here
 * costs one upsert and removes that entire failure mode: the webhook becomes an
 * optimisation (and the only path for user.deleted) rather than a hard
 * dependency.
 */
async function ensureUserRow(user: AuthedUser): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    try {
        await getPool().query(
            `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
            [user.userId, user.email, user.name],
        );
    } catch (err) {
        // Never turn a database hiccup into a failed sign-in; the caller's own
        // query will surface a real problem with a clearer error.
        console.error('Could not mirror Clerk user into users table:', err);
    }
}

/**
 * Verifies the Clerk session token from the Authorization header and fetches
 * the caller's primary email/name from Clerk. Returns null (and has already
 * written an error response) if the request isn't authenticated.
 */
export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<AuthedUser | null> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
        error(res, 401, 'Sign in to continue.');
        return null;
    }

    // An API key is recognised by its prefix and never reaches Clerk: the two
    // credential types are disjoint, so a malformed one of either kind cannot
    // be probed against the other's verifier.
    if (looksLikeApiKey(token)) return authenticateApiKey(res, token);

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
        error(res, 501, 'Sign-in is not configured on this deployment yet.');
        return null;
    }

    try {
        const claims = await verifyToken(token, { secretKey });
        const clerkClient = createClerkClient({ secretKey });
        const user = await clerkClient.users.getUser(claims.sub);
        const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
        if (!email) {
            error(res, 401, 'Your account is missing an email address.');
            return null;
        }
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
        const authed = { userId: user.id, email, name };
        await ensureUserRow(authed);
        return authed;
    } catch {
        error(res, 401, 'Your session has expired. Sign in again.');
        return null;
    }
}

/**
 * Authenticates a Growth API key.
 *
 * The tier is re-checked on every request rather than at issue time: a key
 * minted on Growth must stop working the moment the account drops below it,
 * and the alternative — trusting a flag stamped into the key — would keep
 * a lapsed customer's automation running indefinitely.
 *
 * Identity comes from the local users row, not Clerk. There is no session
 * here, and calling Clerk on every API request would add a network round trip
 * to a path meant for CI.
 */
async function authenticateApiKey(res: VercelResponse, token: string): Promise<AuthedUser | null> {
    if (!process.env.DATABASE_URL) {
        error(res, 501, 'The API is not configured on this deployment yet.');
        return null;
    }

    const pool = getPool();
    const owner = await resolveApiKey(pool, token);
    if (!owner) {
        error(res, 401, 'That API key is not valid, or has been revoked.');
        return null;
    }

    const { rows } = await pool.query('SELECT email, name, tier FROM users WHERE id = $1', [owner.userId]);
    const user = rows[0];
    if (!user) {
        error(res, 401, 'That API key is not valid, or has been revoked.');
        return null;
    }
    if (!limitsFor(user.tier).apiAccess) {
        error(res, 402, 'API access is part of the Growth plan. This key belongs to an account that is no longer on it.');
        return null;
    }

    touchApiKey(pool, owner.keyId);
    return { userId: owner.userId, email: user.email, name: user.name ?? null, viaApiKey: true };
}
