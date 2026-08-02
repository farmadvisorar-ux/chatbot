import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from './_lib/http.js';
import { requireSignedIn } from './_lib/auth.js';
import { isPaywallBypassed } from './_lib/paywall.js';

/**
 * GET /api/account-status
 * Reports whether the signed-in caller currently has paid access, so the
 * console can decide whether to show the paywall or the recovery tools.
 * Unlike the other routes this does NOT require payment — a signed-in but
 * unpaid user still needs this to know they should see the paywall.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;

    const user = await requireSignedIn(req, res);
    if (!user) return;

    const paid = isPaywallBypassed() || Boolean(user.accessExpiresAt && user.accessExpiresAt > Date.now());
    json(res, 200, {
        email: user.email,
        paid,
        accessExpiresAt: user.accessExpiresAt,
    });
}
