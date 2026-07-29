import type { VercelRequest, VercelResponse } from '@vercel/node';
import type pg from 'pg';
import { randomBytes } from 'node:crypto';
import { error, json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { hasActiveAccess } from '../_lib/stripe.js';
import { runScan } from '../../lib/scanner/engine.js';
import { DisallowedTargetError } from '../../lib/scanner/net.js';
import type { Finding } from '../../lib/scanner/types.js';
import { isAutoFixable } from '../../lib/fixers/registry.js';

export const config = { maxDuration: 30 };

const FREE_FULL_SCAN_LIMIT = 1;
const RESCAN_INTERVAL_DAYS = 30;

export async function persistScanResult(
    pool: pg.Pool,
    scanId: string,
    outcome: { findings: Finding[]; score: number; grade: string; summary: Record<string, number> },
): Promise<void> {
    for (const f of outcome.findings) {
        await pool.query(
            `INSERT INTO findings (scan_id, check_id, title, severity, impact, description, evidence, remediation, references, affected_url, auto_fixable)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [scanId, f.checkId, f.title, f.severity, f.impact, f.description, f.evidence ?? null, f.remediation, f.references ?? [], f.affectedUrl ?? null, isAutoFixable(f.checkId, f.title)],
        );
    }
    await pool.query(
        `UPDATE scans SET status = 'completed', score = $2, grade = $3, summary = $4, completed_at = now() WHERE id = $1`,
        [scanId, outcome.score, outcome.grade, JSON.stringify(outcome.summary)],
    );
}

const RECENT_ACTIVITY_LIMIT = 20;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const pool = getPool();

    if (req.method === 'GET') {
        // Recent activity across every site the user owns — feeds the
        // dashboard's overview activity feed without a request per target.
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

    const { rows: userRows } = await pool.query('SELECT subscription_status, plan, plan_expires_at FROM users WHERE id = $1', [user.userId]);
    const subscribed = hasActiveAccess(userRows[0] ?? {});
    if (!subscribed) {
        const { rows: countRows } = await pool.query(
            `SELECT count(*) FROM scans WHERE user_id = $1 AND kind = 'full' AND status = 'completed'`,
            [user.userId],
        );
        if (Number(countRows[0].count) >= FREE_FULL_SCAN_LIMIT) {
            error(res, 402, 'Free trial audit already used. Upgrade to Audit ($7/mo or $59.99/yr) for unlimited on-demand and automatic 30-day audits.');
            return;
        }
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
