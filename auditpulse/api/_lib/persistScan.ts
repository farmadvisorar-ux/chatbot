import type pg from 'pg';
import type { Finding } from '../../lib/scanner/types.js';
import { isAutoFixable } from '../../lib/fixers/registry.js';

/** Shared by the scans route handler and the cron re-audit job — kept out of a route file so it isn't tied to one specific API path. */
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
