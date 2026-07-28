import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../../_lib/http.js';
import { requireAuth } from '../../_lib/auth.js';
import { getPool } from '../../_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'DELETE'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const pool = getPool();

    const { rows: targetRows } = await pool.query('SELECT * FROM targets WHERE id = $1 AND user_id = $2', [id, user.userId]);
    const target = targetRows[0];
    if (!target) {
        error(res, 404, 'Target not found.');
        return;
    }

    if (req.method === 'DELETE') {
        await pool.query('DELETE FROM targets WHERE id = $1', [id]);
        json(res, 200, { deleted: true });
        return;
    }

    const { rows: scans } = await pool.query(
        `SELECT id, kind, status, score, grade, summary, started_at, completed_at, triggered_by, share_token
         FROM scans WHERE target_id = $1 ORDER BY started_at DESC LIMIT 50`,
        [id],
    );
    json(res, 200, { target, scans });
}
