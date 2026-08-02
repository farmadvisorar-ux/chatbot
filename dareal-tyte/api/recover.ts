import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod } from './_lib/http.js';
import { requirePaidUser } from './_lib/auth.js';
import { normalizeDomain, normalizeTimestamp, archiveSnapshotUrl, ValidationError } from './_lib/domain.js';
import { fetchSnapshotHtml, ArchiveFetchError } from './_lib/archive.js';
import { sanitizeSnapshotHtml } from './_lib/sanitize.js';

/**
 * POST /api/recover
 * Body: { domain: "examplehairsalon.com", timestamp?: "20220115000000" }
 *
 * DAREAL retrieval + TYTE sanitization only — returns the cleaned HTML
 * without deploying it anywhere. Useful for previewing before /api/launch.
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
        const { html, strippedLinks, rewrittenAssets } = sanitizeSnapshotHtml(rawHtml);

        json(res, 200, {
            success: true,
            message: 'Website logic reconstructed and sanitized successfully.',
            domain,
            timestamp,
            strippedLinks,
            rewrittenAssets,
            data: html,
        });
    } catch (err) {
        if (err instanceof ArchiveFetchError) return error(res, 502, err.message);
        console.error('recover: unexpected failure', err);
        error(res, 500, 'Failed to retrieve or sanitize the historical snapshot.');
    }
}
