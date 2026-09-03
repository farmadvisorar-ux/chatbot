import { getPool } from './db.js';

export interface ScanByToken {
    id: string;
    kind: string;
    status: string;
    score: number | null;
    grade: string | null;
    summary: { critical: number; high: number; medium: number; low: number; info: number };
    started_at: string;
    completed_at: string | null;
    target_url: string;
    target_label: string | null;
}

/**
 * Looks up a scan by its unguessable share_token — the single query behind
 * every public, no-auth surface keyed on a mailed/shared report link:
 * api/report.ts (the interactive report), api/og.ts (the share-card image),
 * and api/share/[token].ts (the crawler-facing bounce page). Kept in one
 * place so all three agree on exactly what "this token" means.
 */
export async function getScanByToken(token: string): Promise<ScanByToken | null> {
    if (!token) return null;
    const pool = getPool();
    const { rows } = await pool.query(
        `SELECT s.id, s.kind, s.status, s.score, s.grade, s.summary, s.started_at, s.completed_at,
                t.url AS target_url, t.label AS target_label
         FROM scans s JOIN targets t ON t.id = s.target_id
         WHERE s.share_token = $1`,
        [token],
    );
    return rows[0] ?? null;
}
