import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { error, json, requireMethod } from '../_lib/http.js';
import { getPool } from '../_lib/db.js';
import { runScan } from '../../lib/scanner/engine.js';
import { sendReportEmail } from '../_lib/email.js';
import { persistScanResult } from '../_lib/persistScan.js';
import { generateAuditPdf } from '../../lib/pdf/report.js';
import { siteOrigin } from '../_lib/site.js';

export const config = { maxDuration: 60 };

const BATCH_SIZE = 5;

/**
 * Vercel Cron hits this daily (see vercel.json). Finds every verified
 * target whose 30-day re-audit is due, re-runs the full scan, and emails the report automatically. Capped to a
 * small batch per run so one invocation can't exceed the function's time
 * budget; targets not reached today are picked up on the next run since
 * next_rescan_at is only pushed forward once a scan actually completes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${cronSecret}`) {
            error(res, 401, 'Unauthorized');
            return;
        }
    }

    const pool = getPool();
    const { rows: due } = await pool.query(
        `SELECT t.*, u.email AS owner_email, u.name AS owner_name
         FROM targets t
         JOIN users u ON u.id = t.user_id
         WHERE t.auto_rescan AND t.verified
           AND t.next_rescan_at IS NOT NULL AND t.next_rescan_at <= now()
         ORDER BY t.next_rescan_at ASC
         LIMIT $1`,
        [BATCH_SIZE],
    );

    const results: { targetId: string; ok: boolean; error?: string }[] = [];

    for (const target of due) {
        const shareToken = randomBytes(24).toString('base64url');
        const { rows: scanRows } = await pool.query(
            `INSERT INTO scans (target_id, user_id, kind, status, share_token, triggered_by) VALUES ($1,$2,'full','running',$3,'auto_rescan') RETURNING id`,
            [target.id, target.user_id, shareToken],
        );
        const scanId = scanRows[0].id;

        try {
            const outcome = await runScan(target.url, 'full');
            await persistScanResult(pool, scanId, outcome);
            await pool.query(
                `UPDATE targets SET last_scanned_at = now(), next_rescan_at = now() + interval '30 days' WHERE id = $1`,
                [target.id],
            );

            const recipients = [target.owner_email, ...(target.client_emails || [])];
            const { rows: allFindings } = await pool.query(
                `SELECT title, severity, impact, description, evidence, remediation, reference_links, affected_url FROM findings WHERE scan_id = $1
                 ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
                [scanId],
            );
            const reportUrl = `${siteOrigin()}/report.html?token=${encodeURIComponent(shareToken)}`;
            const pdfBuffer = await generateAuditPdf({
                targetLabel: target.label || target.url,
                targetUrl: target.url,
                hostname: target.hostname,
                scanDate: new Date(),
                kind: 'full',
                grade: outcome.grade,
                score: outcome.score,
                summary: outcome.summary as never,
                findings: allFindings,
                reportUrl,
                verifiedOwnership: target.verified,
                autoRescan: target.auto_rescan,
            });
            for (const recipient of recipients) {
                await sendReportEmail({
                    toEmail: recipient,
                    note: 'This is your automatic 30-day AuditPulse re-audit.',
                    targetLabel: target.label || target.url,
                    targetUrl: target.url,
                    grade: outcome.grade,
                    score: outcome.score,
                    summary: outcome.summary as never,
                    topFindings: allFindings.slice(0, 8),
                    shareToken,
                    senderName: target.owner_name,
                    pdfBuffer,
                });
            }

            results.push({ targetId: target.id, ok: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Scan failed.';
            await pool.query(`UPDATE scans SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [scanId, message]);
            // Push the schedule forward anyway so a permanently-broken target doesn't monopolize every run.
            await pool.query(`UPDATE targets SET next_rescan_at = now() + interval '30 days' WHERE id = $1`, [target.id]);
            results.push({ targetId: target.id, ok: false, error: message });
        }
    }

    json(res, 200, { processed: results.length, results });
}
