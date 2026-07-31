import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, clientKey } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { checkRateLimit } from '../_lib/rateLimit.js';
import { validEmail, clean } from '../_lib/validate.js';
import { sendReportEmail } from '../_lib/email.js';
import { siteOrigin } from '../_lib/stripe.js';
import { generateAuditPdf } from '../../lib/pdf/report.js';

export const config = { maxDuration: 30 };

/**
 * Single dynamic segment only — see api/targets/[id].ts for why. Extra
 * actions are dispatched via `?action=` instead of an extra path segment:
 *   (no action)     -> GET scan detail + findings
 *   ?action=email    -> POST email the report (with PDF certificate) to a recipient
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const user = await requireAuth(req, res);
    if (!user) return;
    const pool = getPool();
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const action = typeof req.query.action === 'string' ? req.query.action : '';

    if (action === 'email') {
        await handleEmail(req, res, user, pool, id);
        return;
    }
    if (action) {
        error(res, 404, 'Not found.');
        return;
    }
    await handleSingle(req, res, user, pool, id);
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
