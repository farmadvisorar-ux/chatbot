import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, clientKey } from './_lib/http.js';
import { validUrl, clean } from './_lib/validate.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { getPool } from './_lib/db.js';
import { runScan } from '../lib/scanner/engine.js';
import { DisallowedTargetError } from '../lib/scanner/net.js';

/**
 * Free, unauthenticated "quick check": headers/TLS/cookies/fingerprint only
 * — the same single passive request a browser already makes when visiting
 * the URL. No ownership verification required, nothing persisted. Rate
 * limited per-IP since it's open to anyone on the landing page.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const url = clean(req.body?.url, 2048);
    if (!validUrl(url)) {
        error(res, 400, 'Enter a valid http(s):// URL.');
        return;
    }

    if (process.env.DATABASE_URL) {
        try {
            const allowed = await checkRateLimit(getPool(), 'quick-check', clientKey(req), 8, 10);
            if (!allowed) {
                error(res, 429, 'Too many checks from this IP. Try again in a few minutes, or sign up for unlimited audits.');
                return;
            }
        } catch {
            // Rate limiting is best-effort; a DB hiccup shouldn't block the free tool.
        }
    }

    try {
        const result = await runScan(url, 'quick');
        // Normalized to the same shape the dashboard/report endpoints return
        // (findings loaded from Postgres), so the frontend has one finding
        // shape to render everywhere.
        json(res, 200, {
            score: result.score,
            grade: result.grade,
            summary: result.summary,
            findings: result.findings.map(f => ({
                check_id: f.checkId,
                title: f.title,
                severity: f.severity,
                impact: f.impact,
                description: f.description,
                evidence: f.evidence ?? null,
                remediation: f.remediation,
                reference_links: f.references ?? [],
                affected_url: f.affectedUrl ?? null,
            })),
        });
    } catch (err) {
        if (err instanceof DisallowedTargetError) {
            error(res, 400, err.message);
            return;
        }
        error(res, 502, err instanceof Error ? err.message : 'Scan failed.');
    }
}
