import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod } from './_lib/http.js';
import { requireApiKey } from './_lib/auth.js';
import { normalizeDomain, normalizeProjectId, ValidationError } from './_lib/domain.js';
import { verifyDomainStatus, VercelApiError } from './_lib/vercelClient.js';

/**
 * POST /api/verify-dns
 * Body: { projectId: "dareal-oldhairwebsite-com", customDomain: "mybrandnewdomain.com" }
 * Polls Vercel to check whether the domain's A/CNAME records are live.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    if (!requireApiKey(req, res)) return;

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
        const result = await verifyDomainStatus(projectId, customDomain);
        json(res, 200, {
            success: true,
            domain: result.domain,
            dns_configuration_valid: result.verified,
            misconfigured: !result.verified,
            verificationChallenges: result.verification,
        });
    } catch (err) {
        if (err instanceof VercelApiError) return error(res, 502, err.message);
        console.error('verify-dns: unexpected failure', err);
        error(res, 500, 'Unable to sync live configuration status from Vercel.');
    }
}
