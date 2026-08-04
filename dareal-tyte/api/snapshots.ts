import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod } from './_lib/http.js';
import { requirePaidUser } from './_lib/auth.js';
import { normalizeDomain, ValidationError } from './_lib/domain.js';
import { fetchSnapshots, CdxError } from './_lib/cdx.js';

/**
 * The full-history CDX query is slow for heavily archived domains, and the
 * fallback adds another round trip on top. Vercel's default function budget
 * killed those requests before our own timeouts could return anything
 * useful, so this needs explicit headroom.
 */
export const config = { maxDuration: 60 };

/**
 * POST /api/snapshots
 * Body: { domain: "oldhairwebsite.com" }
 * Lists available Wayback Machine snapshots (one per month, newest first) so
 * the console can offer a picker instead of guessing a single timestamp.
 * `complete: false` means only recent captures could be retrieved in time.
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
        const { snapshots, complete } = await fetchSnapshots(domain);
        json(res, 200, { domain, snapshots, complete });
    } catch (err) {
        if (err instanceof CdxError) return error(res, 502, err.message);
        console.error('snapshots: unexpected failure', err);
        error(res, 500, 'Could not look up snapshots.');
    }
}
