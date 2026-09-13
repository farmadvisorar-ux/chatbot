import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, clientKey } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { checkRateLimit } from '../_lib/rateLimit.js';
import { validEmail, clean } from '../_lib/validate.js';
import { sendReportEmail } from '../_lib/email.js';
import { siteOrigin } from '../_lib/site.js';
import { decryptSecret } from '../_lib/crypto.js';
import { getRepo, GitHubApiError } from '../../lib/github.js';
import { applyFixes, FixNotApplicableError } from '../../lib/fixers/index.js';
import { generateAuditPdf } from '../../lib/pdf/report.js';
import { tierForUser } from '../_lib/tier.js';
import { toCsv, filenameSlug } from '../_lib/csv.js';

export const config = { maxDuration: 30 };

/**
 * Single dynamic segment only — see api/targets/[id].ts for why. Extra
 * actions are dispatched via `?action=` instead of an extra path segment:
 *   (no action)      -> GET scan detail + findings
 *   ?action=email     -> POST email the report (with PDF certificate) to a recipient
 *   ?action=fix-all    -> POST open one pull request fixing every auto-fixable finding
 *   ?action=export     -> GET download every finding as CSV (&format=csv, default) or JSON
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
    if (action === 'fix-all') {
        await handleFixAll(req, res, user, pool, id);
        return;
    }
    if (action === 'export') {
        await handleExport(req, res, user, pool, id);
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

/**
 * Opens a single pull request resolving every auto-fixable finding on this
 * scan. Fixing them one at a time produces a PR per finding, and because all
 * seven security headers live in the same vercel.json block those PRs conflict
 * with each other — batching keeps it to one reviewable change.
 */
async function handleFixAll(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const { rows: scanRows } = await pool.query(
        `SELECT s.id, t.github_repo, t.github_token_encrypted
         FROM scans s JOIN targets t ON t.id = s.target_id
         WHERE s.id = $1 AND s.user_id = $2`,
        [id, user.userId],
    );
    const scan = scanRows[0];
    if (!scan) {
        error(res, 404, 'Scan not found.');
        return;
    }
    if (!scan.github_repo || !scan.github_token_encrypted) {
        error(res, 400, 'Connect a GitHub repo on this site first.');
        return;
    }

    const { rows: findings } = await pool.query(
        `SELECT id, check_id, title, evidence, affected_url FROM findings
         WHERE scan_id = $1 AND auto_fixable = true AND fix_status IN ('none', 'failed')
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        [id],
    );
    if (!findings.length) {
        error(res, 400, 'There are no outstanding auto-fixable findings on this scan.');
        return;
    }

    const [owner, repo] = scan.github_repo.split('/');
    let token: string;
    try {
        token = decryptSecret(scan.github_token_encrypted);
    } catch {
        error(res, 500, 'Could not decrypt the stored GitHub token. Reconnect the repo.');
        return;
    }

    try {
        const repoInfo = await getRepo(token, owner, repo);
        const result = await applyFixes({
            token, owner, repo,
            defaultBranch: repoInfo.defaultBranch,
            findings: findings.map(f => ({
                id: f.id,
                checkId: f.check_id,
                title: f.title,
                evidence: f.evidence,
                affectedUrl: f.affected_url,
            })),
        });

        if (result.fixedIds.length) {
            await pool.query(
                `UPDATE findings SET fix_status = 'pr_open', fix_pr_url = $2, fix_error = NULL WHERE id = ANY($1::uuid[])`,
                [result.fixedIds, result.prUrl],
            );
        }
        for (const skip of result.skipped) {
            await pool.query(`UPDATE findings SET fix_status = 'failed', fix_error = $2 WHERE id = $1`, [skip.id, skip.reason]);
        }

        json(res, 200, { prUrl: result.prUrl, fixedCount: result.fixedIds.length, skipped: result.skipped });
    } catch (err) {
        const message = err instanceof FixNotApplicableError ? err.message
            : err instanceof GitHubApiError ? `GitHub error: ${err.message}`
            : err instanceof Error ? err.message : 'Could not open a fix PR.';
        error(res, 422, message);
    }
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

/** Columns in the exported file. Order is the reading order of the report, not the table's. */
const EXPORT_COLUMNS: { header: string; column: string }[] = [
    { header: 'severity', column: 'severity' },
    { header: 'title', column: 'title' },
    { header: 'check_id', column: 'check_id' },
    { header: 'affected_url', column: 'affected_url' },
    { header: 'impact', column: 'impact' },
    { header: 'description', column: 'description' },
    { header: 'evidence', column: 'evidence' },
    { header: 'remediation', column: 'remediation' },
    { header: 'references', column: 'reference_links' },
    { header: 'auto_fixable', column: 'auto_fixable' },
    { header: 'fix_status', column: 'fix_status' },
    { header: 'fix_pr_url', column: 'fix_pr_url' },
];

/**
 * Every finding on one scan as a file, for a spreadsheet, a ticket importer or
 * a customer's own warehouse.
 *
 * Deliberately a whole-scan export rather than a paginated endpoint: the thing
 * being exported is a point-in-time audit, and a half-downloaded audit is a
 * misleading one.
 */
async function handleExport(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;

    const limits = await tierForUser(pool, user.userId);
    if (!limits.dataExport) {
        error(res, 402, 'CSV and JSON export are part of the Growth plan.');
        return;
    }

    const { rows: scanRows } = await pool.query(
        `SELECT s.id, s.score, s.grade, s.status, s.started_at, s.completed_at,
                t.url AS target_url, t.hostname
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
        `SELECT ${EXPORT_COLUMNS.map(c => c.column).join(', ')} FROM findings WHERE scan_id = $1 ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, title`,
        [id],
    );

    // The scan date, not today's: re-downloading last month's audit should
    // produce the same filename it produced last month.
    const stamp = new Date(scan.completed_at ?? scan.started_at).toISOString().slice(0, 10);
    const base = `auditpulse-${filenameSlug(scan.hostname)}-${stamp}`;
    const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'csv';

    if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
        res.status(200).send(JSON.stringify({
            scan: {
                id: scan.id,
                url: scan.target_url,
                hostname: scan.hostname,
                score: scan.score,
                grade: scan.grade,
                status: scan.status,
                started_at: scan.started_at,
                completed_at: scan.completed_at,
            },
            findings,
        }, null, 2));
        return;
    }

    if (format !== 'csv') {
        error(res, 400, 'Supported formats are csv and json.');
        return;
    }

    const csv = toCsv(
        EXPORT_COLUMNS.map(c => c.header),
        findings.map(row => EXPORT_COLUMNS.map(c => row[c.column])),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    // UTF-8 BOM: without it Excel on Windows decodes the file as the local
    // codepage and mangles every non-ASCII character in a finding's text.
    res.status(200).send(`\uFEFF${csv}`);
}
