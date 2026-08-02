import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod } from './_lib/http.js';
import { requirePaidUser } from './_lib/auth.js';
import { normalizeDomain, normalizeTimestamp, archiveSnapshotUrl, ValidationError } from './_lib/domain.js';
import { fetchSnapshotHtml, ArchiveFetchError } from './_lib/archive.js';
import { sanitizeSnapshotHtml } from './_lib/sanitize.js';
import { deployToVercel, VercelApiError } from './_lib/vercelClient.js';

/**
 * POST /api/launch
 * Body: { domain: "oldhairwebsite.com", timestamp?: "20210101000000" }
 *
 * Full pipeline: DAREAL retrieval -> TYTE sanitization -> Vercel production
 * deployment. Use /api/map-domain afterward to attach a custom domain to
 * the resulting project.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    if (!(await requirePaidUser(req, res))) return;

    let domain: string;
    let timestamp: string;
    try {
        domain = normalizeDomain(req.body?.domain);
        timestamp = normalizeTimestamp(req.body?.timestamp);
    } catch (err) {
        if (err instanceof ValidationError) return error(res, 400, err.message);
        throw err;
    }

    try {
        const archiveUrl = archiveSnapshotUrl(domain, timestamp);
        const rawHtml = await fetchSnapshotHtml(archiveUrl);
        const { html } = sanitizeSnapshotHtml(rawHtml);
        const deployment = await deployToVercel(html, domain);

        json(res, 200, {
            success: true,
            message: deployment.public
                ? 'Website logic pulled, sanitized, and deployed successfully.'
                : 'Deployed, but could not confirm the preview link is public — it may prompt for a Vercel login. Check the project\'s Deployment Protection setting.',
            target_domain: domain,
            timestamp,
            projectId: deployment.projectId,
            preview_url: deployment.liveUrl,
            deployment_id: deployment.deploymentId,
            public: deployment.public,
        });
    } catch (err) {
        if (err instanceof ArchiveFetchError) return error(res, 502, err.message);
        if (err instanceof VercelApiError) return error(res, 502, err.message);
        console.error('launch: unexpected failure', err);
        error(res, 500, 'Unified DAREALTYTE pipeline execution failed.');
    }
}
