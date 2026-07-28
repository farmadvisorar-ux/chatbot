import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../../_lib/http.js';
import { requireAuth } from '../../_lib/auth.js';
import { getPool } from '../../_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const pool = getPool();

    const { rows: scanRows } = await pool.query(
        `SELECT s.*, t.url AS target_url, t.label AS target_label, t.hostname
         FROM scans s JOIN targets t ON t.id = s.target_id
         WHERE s.id = $1 AND s.user_id = $2`,
        [id, user.userId],
    );
    const scan = scanRows[0];
    if (!scan) {
        error(res, 404, 'Scan not found.');
        return;
    }

    const { rows: findings } = await pool.query(
        `SELECT * FROM findings WHERE scan_id = $1 ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        [id],
    );

    json(res, 200, { scan, findings });
}
