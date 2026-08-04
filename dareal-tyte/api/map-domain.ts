import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod } from './_lib/http.js';
import { requirePaidUser } from './_lib/auth.js';
import { normalizeDomain, normalizeProjectId, ValidationError } from './_lib/domain.js';
import { mapCustomDomain, VercelApiError } from './_lib/vercelClient.js';

/**
 * POST /api/map-domain
 * Body: { projectId: "dareal-oldhairwebsite-com", customDomain: "mybrandnewdomain.com" }
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    if (!(await requirePaidUser(req, res))) return;

    let projectId: string;
    let customDomain: string;
    try {
        projectId = normalizeProjectId(req.body?.projectId);
        customDomain = normalizeDomain(req.body?.customDomain);
    } catch (err) {
        if (err instanceof ValidationError) return error(res, 400, err.message);
        throw err;
    }

    try {
        const result = await mapCustomDomain(projectId, customDomain);
        json(res, 200, {
            success: true,
            domain: result.domain,
            verified: result.verified,
            verificationChallenges: result.verification,
            message: 'Custom domain attached to the Vercel project.',
        });
    } catch (err) {
        if (err instanceof VercelApiError) return error(res, 502, err.message);
        console.error('map-domain: unexpected failure', err);
        error(res, 500, 'Failed to create the Vercel domain assignment.');
    }
}
