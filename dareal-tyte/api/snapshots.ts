import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod } from './_lib/http.js';
import { requirePaidUser } from './_lib/auth.js';
import { normalizeDomain, ValidationError } from './_lib/domain.js';
import { fetchSnapshots, CdxError } from './_lib/cdx.js';

/**
 * POST /api/snapshots
 * Body: { domain: "oldhairwebsite.com" }
 * Lists available Wayback Machine snapshots (one per day, newest first) so
 * the console can offer a picker instead of guessing a single timestamp.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    if (!(await requirePaidUser(req, res))) return;

    let domain: string;
    try {
        domain = normalizeDomain(req.body?.domain);
    } catch (err) {
        if (err instanceof ValidationError) return error(res, 400, err.message);
        throw err;
    }

    try {
        const snapshots = await fetchSnapshots(domain);
        json(res, 200, { domain, snapshots });
    } catch (err) {
        if (err instanceof CdxError) return error(res, 502, err.message);
        console.error('snapshots: unexpected failure', err);
        error(res, 500, 'Could not look up snapshots.');
    }
}
