import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { error, json, requireMethod, clientKey } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { hasActiveAccess } from '../_lib/stripe.js';
import { checkRateLimit } from '../_lib/rateLimit.js';
import { validEmail, clean } from '../_lib/validate.js';
import { sendReportEmail } from '../_lib/email.js';
import { persistScanResult } from '../_lib/persistScan.js';
import { runScan } from '../../lib/scanner/engine.js';
import { DisallowedTargetError } from '../../lib/scanner/net.js';
import { generateAuditPdf } from '../../lib/pdf/report.js';
import { siteOrigin } from '../_lib/stripe.js';

export const config = { maxDuration: 30 };

const FREE_FULL_SCAN_LIMIT = 1;
const RESCAN_INTERVAL_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 20;

/**
 * Single catch-all for every /api/scans* route, consolidated from three
 * separate functions (index, [id], [id]/email) to stay under Vercel's
 * Hobby-plan 12-function cap. URLs are unchanged:
 *   []              -> GET recent activity / POST run a new audit
 *   [id]             -> GET scan detail + findings
 *   [id, 'email']    -> POST email the report to a recipient
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const user = await requireAuth(req, res);
    if (!user) return;
    const pool = getPool();

    const raw = req.query.segments;
    const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];

    if (segments.length === 0) {
        await handleCollection(req, res, user, pool);
        return;
    }
    if (segments.length === 1) {
        await handleSingle(req, res, user, pool, segments[0]);
        return;
    }
    if (segments.length === 2 && segments[1] === 'email') {
        await handleEmail(req, res, user, pool, segments[0]);
        return;
    }
    error(res, 404, 'Not found.');
}

async function handleCollection(req: VercelRequest, res: VercelResponse, user: { userId: string; name: string | null }, pool: ReturnType<typeof getPool>): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

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

async function handleSingle(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;

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

async function handleEmail(req: VercelRequest, res: VercelResponse, user: { userId: string; name: string | null }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const recipient = clean(req.body?.recipient, 254);
    const note = clean(req.body?.note, 1000);

    if (!validEmail(recipient)) {
        error(res, 400, 'Enter a valid recipient email address.');
        return;
    }

    const allowed = await checkRateLimit(pool, 'scan-email', clientKey(req), 20, 60);
    if (!allowed) {
        error(res, 429, 'Too many report emails sent recently. Try again shortly.');
        return;
    }

    const { rows: scanRows } = await pool.query(
        `SELECT s.*, t.url AS target_url, t.label AS target_label, t.hostname, t.verified, t.auto_rescan
         FROM scans s JOIN targets t ON t.id = s.target_id
         WHERE s.id = $1 AND s.user_id = $2 AND s.status = 'completed'`,
        [id, user.userId],
    );
    const scan = scanRows[0];
    if (!scan) {
        error(res, 404, 'Completed scan not found.');
        return;
    }

    const { rows: allFindings } = await pool.query(
        `SELECT title, severity, impact, description, evidence, remediation, reference_links, affected_url FROM findings WHERE scan_id = $1
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        [id],
    );

    const reportUrl = `${siteOrigin()}/report.html?token=${encodeURIComponent(scan.share_token)}`;
    const pdfBuffer = await generateAuditPdf({
        targetLabel: scan.target_label || scan.target_url,
        targetUrl: scan.target_url,
        hostname: scan.hostname,
        scanDate: new Date(scan.completed_at || scan.started_at),
        kind: scan.kind,
        grade: scan.grade,
        score: scan.score,
        summary: scan.summary,
        findings: allFindings,
        reportUrl,
        verifiedOwnership: scan.verified,
        autoRescan: scan.auto_rescan,
    });

    const result = await sendReportEmail({
        toEmail: recipient,
        note: note || undefined,
        targetLabel: scan.target_label || scan.target_url,
        targetUrl: scan.target_url,
        grade: scan.grade,
        score: scan.score,
        summary: scan.summary,
        topFindings: allFindings.slice(0, 8),
        shareToken: scan.share_token,
        senderName: user.name,
        pdfBuffer,
    });

    if (!result.ok) {
        error(res, 502, result.error || 'Could not send email.');
        return;
    }

    await pool.query(
        'INSERT INTO scan_emails (scan_id, recipient, note, sent_by) VALUES ($1,$2,$3,$4)',
        [id, recipient, note || null, user.userId],
    );

    json(res, 200, { sent: true });
}
