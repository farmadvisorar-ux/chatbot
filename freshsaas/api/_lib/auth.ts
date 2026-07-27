import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { error } from './http.js';

export type AuthedUser = { userId: string; email: string; name: string | null };

/**
 * Verifies the Clerk session token from the Authorization header and fetches
 * the caller's primary email/name from Clerk. Returns null (and has already
 * written an error response) if the request isn't authenticated.
 *
 * Fetches the user record rather than reading email off the JWT claims,
 * since the default Clerk session token doesn't include email unless a
 * custom JWT template is configured — this works with zero extra Clerk
 * dashboard setup.
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
        return { userId: user.id, email, name };
    } catch {
        error(res, 401, 'Your session has expired. Sign in again.');
        return null;
    }
}
