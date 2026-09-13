import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { error, json, requireMethod, isRead } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { persistScanResult } from '../_lib/persistScan.js';
import { runScan, type ScanRunResult } from '../../lib/scanner/engine.js';
import { DisallowedTargetError } from '../../lib/scanner/net.js';
import { tierForUser } from '../_lib/tier.js';
import { findNewIssues } from '../_lib/alerts.js';
import { checkRateLimit } from '../_lib/rateLimit.js';

export const config = { maxDuration: 30 };

// The re-audit interval is no longer a constant here — it comes from the
// caller's tier (api/_lib/tier.ts), which is what makes daily re-audits a
// paid difference rather than a number hardcoded for everyone.
const RECENT_ACTIVITY_LIMIT = 20;

/**
 * Audits an account may start per hour. Generous enough for a busy CI pipeline
 * (the GitHub Action runs one per deploy), low enough that a runaway workflow
 * cannot turn our scanner into a flood aimed at the customer's own site.
 */
const SCANS_PER_HOUR = 60;

/** Severities that fail a CI build. Medium and below are reported, never blocking — a gate that fails on everything gets disabled within a week. */
const BLOCKING_SEVERITIES = new Set(['critical', 'high']);

/** GET recent activity across every site the user owns / POST run a new audit. Split out from api/scans/[id].ts because a bare `/api/scans` request (no id segment) doesn't reach a `[id].ts` dynamic route. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!requireMethod(req, res, ['GET', 'POST'])) return;
    const pool = getPool();

    if (isRead(req)) {
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
    const wantsGate = req.body?.gate === true || req.body?.gate === 'true';

    if (!await checkRateLimit(pool, 'scan', user.userId, SCANS_PER_HOUR, 60)) {
        error(res, 429, `That's more than ${SCANS_PER_HOUR} audits in an hour. Wait a few minutes, or slow the job that's calling this.`);
        return;
    }

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

    const limits = await tierForUser(pool, user.userId);

    try {
        const outcome = await runScan(target.url, 'full', { maxPages: limits.crawlPages });
        await persistScanResult(pool, scan.id, outcome);
        await pool.query(
            `UPDATE targets SET last_scanned_at = now(), next_rescan_at = now() + make_interval(hours => $2) WHERE id = $1`,
            [targetId, limits.rescanIntervalHours],
        );
        if (wantsGate) {
            json(res, 201, { scanId: scan.id, gate: await buildGate(pool, user.userId, targetId, scan.id, outcome) });
            return;
        }
        json(res, 201, { scanId: scan.id });
    } catch (err) {
        const message = err instanceof DisallowedTargetError ? err.message : err instanceof Error ? err.message : 'Scan failed.';
        await pool.query(`UPDATE scans SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`, [scan.id, message]);
        error(res, 502, message);
    }
}

/**
 * The CI verdict: did this audit introduce a Critical or High that the
 * previous audit didn't have?
 *
 * Deliberately "new since last audit" rather than "any Critical or High".
 * A team adopting this on an existing site starts with a backlog they did not
 * create in the commit being built, and a gate that fails every build from day
 * one is a gate that gets deleted. What this catches is the regression — the
 * deploy that removed a header, added a skimmer, or shipped a vulnerable
 * dependency.
 *
 * The very first audit of a site has nothing to compare against and therefore
 * always passes, with `baseline: true` saying so rather than implying a clean
 * bill of health.
 */
async function buildGate(
    pool: ReturnType<typeof getPool>,
    userId: string,
    targetId: string,
    scanId: string,
    outcome: ScanRunResult,
): Promise<unknown> {
    const limits = await tierForUser(pool, userId);
    if (!limits.apiAccess) {
        return { available: false, reason: 'The CI gate is part of the Growth plan.' };
    }

    const { rows: priorRows } = await pool.query(
        `SELECT count(*)::int AS count FROM scans
          WHERE target_id = $1 AND status = 'completed' AND id <> $2`,
        [targetId, scanId],
    );
    const isBaseline = priorRows[0].count === 0;

    const newIssues = isBaseline ? [] : await findNewIssues(pool, targetId, scanId, outcome.findings);
    const blocking = newIssues.filter(f => BLOCKING_SEVERITIES.has(f.severity));

    return {
        available: true,
        passed: blocking.length === 0,
        baseline: isBaseline,
        score: outcome.score,
        grade: outcome.grade,
        blocking: blocking.map(f => ({
            severity: f.severity,
            title: f.title,
            check_id: f.checkId,
            affected_url: f.affectedUrl ?? null,
            remediation: f.remediation,
        })),
        new_non_blocking: newIssues.length - blocking.length,
    };
}
