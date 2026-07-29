import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, clientKey } from '../../_lib/http.js';
import { requireAuth } from '../../_lib/auth.js';
import { getPool } from '../../_lib/db.js';
import { checkRateLimit } from '../../_lib/rateLimit.js';
import { validEmail, clean } from '../../_lib/validate.js';
import { sendReportEmail } from '../../_lib/email.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const recipient = clean(req.body?.recipient, 254);
    const note = clean(req.body?.note, 1000);

    if (!validEmail(recipient)) {
        error(res, 400, 'Enter a valid recipient email address.');
        return;
    }

    const pool = getPool();
    const allowed = await checkRateLimit(pool, 'scan-email', clientKey(req), 20, 60);
    if (!allowed) {
        error(res, 429, 'Too many report emails sent recently. Try again shortly.');
        return;
    }

    const { rows: scanRows } = await pool.query(
        `SELECT s.*, t.url AS target_url, t.label AS target_label
         FROM scans s JOIN targets t ON t.id = s.target_id
         WHERE s.id = $1 AND s.user_id = $2 AND s.status = 'completed'`,
        [id, user.userId],
    );
    const scan = scanRows[0];
    if (!scan) {
        error(res, 404, 'Completed scan not found.');
        return;
    }

    const { rows: topFindings } = await pool.query(
        `SELECT title, severity, impact, description, remediation FROM findings WHERE scan_id = $1
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END
         LIMIT 8`,
        [id],
    );

    const result = await sendReportEmail({
        toEmail: recipient,
        note: note || undefined,
        targetLabel: scan.target_label || scan.target_url,
        targetUrl: scan.target_url,
        grade: scan.grade,
        score: scan.score,
        summary: scan.summary,
        topFindings,
        shareToken: scan.share_token,
        senderName: user.name,
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
