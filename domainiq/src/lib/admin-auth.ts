import { cookies } from 'next/headers';
import { getSession } from './auth';

export const ADMIN_COOKIE_NAME = 'domainiq_admin_token';
export const DEFAULT_ADMIN_KEY = 'domainiq-admin-2026';

export function getAdminPasscode(): string {
    return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_KEY;
}

/**
 * Checks if the request has valid admin credentials:
 * 1. Admin cookie matches the configured admin passcode
 * 2. Or user session has plan === 'admin'
 * 3. Or query param/header matches ADMIN_PASSWORD
 */
export async function verifyAdminAccess(req?: Request): Promise<boolean> {
    const adminPasscode = getAdminPasscode();

    // 1. Check direct authorization header or key param if req provided
    if (req) {
        const url = new URL(req.url);
        const keyParam = url.searchParams.get('key');
        if (keyParam && keyParam === adminPasscode) {
            return true;
        }

        const authHeader = req.headers.get('Authorization');
        if (authHeader && authHeader.replace(/^Bearer\s+/i, '') === adminPasscode) {
            return true;
        }
    }

    // 2. Check admin cookie
    try {
        const cookieStore = cookies();
        const cookieVal = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
        if (cookieVal && cookieVal === adminPasscode) {
            return true;
        }
    } catch {
        // cookies() may throw outside request scope
    }

    // 3. Check logged-in user session
    try {
        const session = await getSession();
        if (session && (session.plan === 'admin' || session.email.endsWith('@domainiq.app'))) {
            return true;
        }
    } catch {
        // ignore
    }

    return false;
}
