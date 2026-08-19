import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, isRead, clientKey } from '../_lib/http.js';
import { validUrl, clean } from '../_lib/validate.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { generateVerificationToken } from '../_lib/verification.js';
import { normalizeTargetUrl } from '../../lib/scanner/engine.js';

/** Per-account cap. Weekly automatic re-audits mean every added site costs recurring scan capacity, so this is a real resource limit, not an upsell. */
const MAX_TARGETS_PER_USER = 10;

/** GET list / POST create. Split out from api/targets/[id].ts because a bare `/api/targets` request (no id segment) doesn't reach a `[id].ts` dynamic route. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const user = await requireAuth(req, res);
    if (!user) return;
    if (!requireMethod(req, res, ['GET', 'POST'])) return;
    const pool = getPool();

    if (isRead(req)) {
        // LEFT JOIN LATERAL pulls in each target's most recent *completed*
        // scan (if any) in the same query, so the dashboard can render grade
        // badges and an overview without a request per site.
        const { rows } = await pool.query(
            `SELECT t.*, u.subscription_status,
                    latest.id AS latest_scan_id, latest.grade AS latest_grade, latest.score AS latest_score,
                    latest.summary AS latest_summary, latest.started_at AS latest_scanned_at
             FROM targets t
             JOIN users u ON u.id = t.user_id
             LEFT JOIN LATERAL (
                 SELECT id, grade, score, summary, started_at FROM scans
                 WHERE target_id = t.id AND status = 'completed'
                 ORDER BY started_at DESC LIMIT 1
             ) latest ON true
             WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
            [user.userId],
        );
        json(res, 200, { targets: rows });
        return;
    }

    // POST — add a new target.
    const url = clean(req.body?.url, 2048);
    const label = clean(req.body?.label, 200) || null;
    const attested = req.body?.attestedAuthorization === true;

    if (!validUrl(url)) {
        error(res, 400, 'Enter a valid http(s):// URL.');
        return;
    }
    if (!attested) {
        error(res, 400, 'You must confirm you own this site or have explicit authorization to test it.');
        return;
    }

    let hostname: string, targetUrl: string;
    try {
        ({ hostname, targetUrl } = normalizeTargetUrl(url));
    } catch {
        error(res, 400, 'Could not parse that URL.');
        return;
    }

    const { rows: countRows } = await pool.query('SELECT count(*)::int AS c FROM targets WHERE user_id = $1', [user.userId]);
    if (countRows[0].c >= MAX_TARGETS_PER_USER) {
        error(res, 409, `You've reached the limit of ${MAX_TARGETS_PER_USER} sites. Remove one before adding another.`);
        return;
    }

    const token = generateVerificationToken();
    const ip = clientKey(req);
    const { rows } = await pool.query(
        `INSERT INTO targets (user_id, url, hostname, label, verification_token, attested_authorization, attested_at, attested_ip)
         VALUES ($1, $2, $3, $4, $5, true, now(), $6)
         RETURNING *`,
        [user.userId, targetUrl, hostname, label, token, ip],
    );

    json(res, 201, { target: rows[0] });
}
