import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { error, json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { persistScanResult } from '../_lib/persistScan.js';
import { runScan } from '../../lib/scanner/engine.js';
import { DisallowedTargetError } from '../../lib/scanner/net.js';

export const config = { maxDuration: 30 };

const RESCAN_INTERVAL_DAYS = 7;
const RECENT_ACTIVITY_LIMIT = 20;

/** GET recent activity across every site the user owns / POST run a new audit. Split out from api/scans/[id].ts because a bare `/api/scans` request (no id segment) doesn't reach a `[id].ts` dynamic route. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!requireMethod(req, res, ['GET', 'POST'])) return;
    const pool = getPool();

    if (req.method === 'GET') {
        const { rows } = await pool.query(
            `SELECT s.id, s.kind, s.status, s.score, s.grade, s.summary, s.started_at, s.completed_at, s.triggered_by,
                    t.id AS target_id, t.label AS target_label, t.hostname
             FROM scans s JOIN targets t ON t.id = s.target_id
             WHERE s.user_id = $1
             ORDER BY s.started_at DESC LIMIT $2`,
            [user.userId, RECENT_ACTIVITY_LIMIT],
        );
        json(res, 200, { scans: rows });
        return;
    }

    const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId : '';

    const { rows: targetRows } = await pool.query('SELECT * FROM targets WHERE id = $1 AND user_id = $2', [targetId, user.userId]);
    const target = targetRows[0];
    if (!target) {
        error(res, 404, 'Target not found.');
        return;
    }
    if (!target.verified) {
        error(res, 403, 'Verify ownership of this site before running a full audit. See the verification instructions on the target.');
        return;
    }

    const shareToken = randomBytes(24).toString('base64url');
    const { rows: scanRows } = await pool.query(
        `INSERT INTO scans (target_id, user_id, kind, status, share_token, triggered_by) VALUES ($1,$2,'full','running',$3,'manual') RETURNING *`,
        [targetId, user.userId, shareToken],
    );
    const scan = scanRows[0];

    try {
        const outcome = await runScan(target.url, 'full');
        await persistScanResult(pool, scan.id, outcome);
        await pool.query(
            `UPDATE targets SET last_scanned_at = now(), next_rescan_at = now() + ($2 || ' days')::interval WHERE id = $1`,
            [targetId, RESCAN_INTERVAL_DAYS],
        );
        json(res, 201, { scanId: scan.id });
    } catch (err) {
        const message = err instanceof DisallowedTargetError ? err.message : err instanceof Error ? err.message : 'Scan failed.';
        await pool.query(`UPDATE scans SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [scan.id, message]);
        error(res, 502, message);
    }
}
