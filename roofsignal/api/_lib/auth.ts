import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error } from './http.ts';

/**
 * RoofSignal Solo has exactly one user, so there is no account system — just
 * a shared secret gating every owner-facing endpoint. `/api/summary/[token]`
 * is the one deliberate exception: it's the link texted to homeowners, and it
 * authorises itself with its own unguessable token instead.
 */
export function requireOwner(req: VercelRequest, res: VercelResponse): boolean {
    const secret = process.env.APP_SECRET;
    if (!secret) {
        error(res, 501, 'This deployment has not set APP_SECRET yet.');
        return false;
    }
    if (req.headers.authorization?.replace(/^Bearer\s+/i, '') !== secret) {
        error(res, 401, 'Unauthorized');
        return false;
    }
    return true;
}
