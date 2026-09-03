import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from './_lib/http.js';
import { getPool } from './_lib/db.js';
import { getScanByToken } from './_lib/scanLookup.js';

/**
 * Public, no-auth report view keyed on the unguessable share_token mailed to
 * the client — this is what lets a non-technical recipient open the emailed
 * report link without creating an AuditPulse account.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
        error(res, 400, 'Missing report token.');
        return;
    }

    const scan = await getScanByToken(token);
    if (!scan) {
        error(res, 404, 'Report not found.');
        return;
    }

    const pool = getPool();
    const { rows: findings } = await pool.query(
        `SELECT title, severity, impact, description, evidence, remediation, reference_links, affected_url, fix_status, fix_pr_url FROM findings
         WHERE scan_id = $1
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        [scan.id],
    );

    json(res, 200, { scan, findings });
}
