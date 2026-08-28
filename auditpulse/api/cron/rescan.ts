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

/** Hard ceiling on rows fetched per run — a safety net, not the real limiter. */
const MAX_BATCH = 25;
/**
 * Stop starting new scans once this much of the function's 60s budget is
 * spent. A full audit crawls several pages and runs 18 checks, so its
 * duration varies a lot; a fixed batch size would either waste the budget
 * or overrun it. Whatever isn't reached stays due and is picked up on the
 * next run, because next_rescan_at only moves forward once a scan finishes.
 */
const TIME_BUDGET_MS = 45_000;

/**
 * Re-audits every verified site whose weekly scan is due, then emails the
 * report (with PDF) to the owner and any client recipients.
 *
 * Throughput is bounded by how often this is invoked. Vercel's Hobby plan
 * allows one cron run per day and a 60s function limit, which is only
 * enough for a handful of sites; point an external scheduler at this same
 * endpoint (with the CRON_SECRET bearer token) to run it more frequently,
 * or move to a plan with sub-daily crons. See the README.
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

    const startedAt = Date.now();
    const pool = getPool();
    const { rows: due } = await pool.query(
        `SELECT t.*, u.email AS owner_email, u.name AS owner_name
         FROM targets t
         JOIN users u ON u.id = t.user_id
         WHERE t.auto_rescan AND t.verified
           AND t.next_rescan_at IS NOT NULL AND t.next_rescan_at <= now()
         ORDER BY t.next_rescan_at ASC
         LIMIT $1`,
        [MAX_BATCH],
    );

    const results: {
        targetId: string;
        ok: boolean;
        error?: string;
        emailsSent?: number;
        emailsFailed?: number;
        emailError?: string;
    }[] = [];
    let skippedForTime = 0;

    for (const target of due) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
            skippedForTime = due.length - results.length;
            break;
        }
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
                `UPDATE targets SET last_scanned_at = now(), next_rescan_at = now() + interval '7 days' WHERE id = $1`,
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
            // A re-audit nobody receives is indistinguishable from no re-audit
            // at all, so delivery failures are counted and reported rather than
            // discarded — an unverified Resend sending domain fails every send
            // while the scan itself still succeeds.
            let emailsSent = 0;
            let emailError: string | undefined;
            for (const recipient of recipients) {
                const sent = await sendReportEmail({
                    toEmail: recipient,
                    note: 'This is your automatic weekly AuditPulse re-audit.',
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
                if (sent.ok) emailsSent += 1;
                else emailError ??= sent.error;
            }
            if (emailError) console.error(`Re-audit report email failed for ${target.hostname}:`, emailError);

            results.push({ targetId: target.id, ok: true, emailsSent, emailsFailed: recipients.length - emailsSent, emailError });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Scan failed.';
            await pool.query(`UPDATE scans SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [scanId, message]);
            // Push the schedule forward anyway so a permanently-broken target doesn't monopolize every run.
            await pool.query(`UPDATE targets SET next_rescan_at = now() + interval '7 days' WHERE id = $1`, [target.id]);
            results.push({ targetId: target.id, ok: false, error: message });
        }
    }

    const emailsFailed = results.reduce((total, r) => total + (r.emailsFailed ?? 0), 0);
    json(res, 200, { processed: results.length, dueRemaining: skippedForTime, emailsFailed, results });
}
