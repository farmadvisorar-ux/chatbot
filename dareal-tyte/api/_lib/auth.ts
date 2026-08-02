import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { error } from './http.js';
import { isPaywallBypassed } from './paywall.js';

export type AuthedUser = {
    userId: string;
    email: string;
    accessExpiresAt: number | null;
};

function bearerToken(req: VercelRequest): string | null {
    const header = req.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/**
 * Verifies the Clerk session token and returns the caller's identity plus
 * their paid-access expiry (stored in Clerk's privateMetadata, set by the
 * Stripe webhook — never trust a client-supplied value here). Writes the
 * appropriate error response and returns null if verification fails; does
 * NOT check whether access has actually expired, see requirePaidUser.
 */
export async function requireSignedIn(req: VercelRequest, res: VercelResponse): Promise<AuthedUser | null> {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
        error(res, 501, 'Sign-in is not configured on this deployment yet.');
        return null;
    }

    const token = bearerToken(req);
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
        const rawExpiry = user.privateMetadata?.accessExpiresAt;
        const accessExpiresAt = typeof rawExpiry === 'number' ? rawExpiry : null;
        return { userId: user.id, email, accessExpiresAt };
    } catch {
        error(res, 401, 'Your session has expired. Sign in again.');
        return null;
    }
}

/**
 * Same as requireSignedIn, but also enforces that paid access hasn't
 * expired. Every route that spends Wayback/Vercel quota on the caller's
 * behalf must use this, not requireSignedIn — being logged in alone doesn't
 * mean the $18 access window is still open.
 */
export async function requirePaidUser(req: VercelRequest, res: VercelResponse): Promise<AuthedUser | null> {
    const user = await requireSignedIn(req, res);
    if (!user) return null;

    if (isPaywallBypassed()) return user;

    if (!user.accessExpiresAt || user.accessExpiresAt < Date.now()) {
        error(res, 402, 'Your access has expired. Purchase access to continue.');
        return null;
    }
    return user;
}
