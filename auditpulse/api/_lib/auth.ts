import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { error } from './http.js';
import { getPool } from './db.js';

export type AuthedUser = { userId: string; email: string; name: string | null };

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
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
        error(res, 501, 'Sign-in is not configured on this deployment yet.');
        return null;
    }

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
        error(res, 401, 'Sign in to continue.');
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
