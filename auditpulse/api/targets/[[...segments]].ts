import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, clientKey } from '../_lib/http.js';
import { validUrl, clean } from '../_lib/validate.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { generateVerificationToken, verifyDomainOwnership } from '../_lib/verification.js';
import { hasActiveAccess } from '../_lib/stripe.js';
import { encryptSecret } from '../_lib/crypto.js';
import { getRepo, GitHubApiError } from '../../lib/github.js';
import { normalizeTargetUrl } from '../../lib/scanner/engine.js';

const FREE_TARGET_LIMIT = 1;
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * Single catch-all for every /api/targets* route, consolidated from what
 * were four separate functions (index, [id], [id]/verify, [id]/github) —
 * Vercel's Hobby plan caps a deployment at 12 serverless functions, and this
 * app's route count outgrew that. URLs the frontend calls are unchanged;
 * only the file layout is different. Routing is by path segment count:
 *   []                -> GET list / POST create
 *   [id]               -> GET detail / DELETE
 *   [id, 'verify']     -> POST check ownership verification
 *   [id, 'github']     -> POST connect / DELETE disconnect GitHub repo
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
    if (segments.length === 2 && segments[1] === 'verify') {
        await handleVerify(req, res, user, pool, segments[0]);
        return;
    }
    if (segments.length === 2 && segments[1] === 'github') {
        await handleGithub(req, res, user, pool, segments[0]);
        return;
    }
    error(res, 404, 'Not found.');
}

async function handleCollection(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    if (req.method === 'GET') {
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

    const { rows: userRows } = await pool.query('SELECT subscription_status, plan, plan_expires_at FROM users WHERE id = $1', [user.userId]);
    const subscribed = hasActiveAccess(userRows[0] ?? {});

    if (!subscribed) {
        const { rows: countRows } = await pool.query('SELECT count(*) FROM targets WHERE user_id = $1', [user.userId]);
        if (Number(countRows[0].count) >= FREE_TARGET_LIMIT) {
            error(res, 402, `Free accounts can add ${FREE_TARGET_LIMIT} site. Upgrade to Audit ($7/mo or $59.99/yr) to add more.`);
            return;
        }
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

async function handleSingle(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'DELETE'])) return;

    const { rows: targetRows } = await pool.query('SELECT * FROM targets WHERE id = $1 AND user_id = $2', [id, user.userId]);
    const target = targetRows[0];
    if (!target) {
        error(res, 404, 'Target not found.');
        return;
    }

    if (req.method === 'DELETE') {
        await pool.query('DELETE FROM targets WHERE id = $1', [id]);
        json(res, 200, { deleted: true });
        return;
    }

    const { rows: scans } = await pool.query(
        `SELECT id, kind, status, score, grade, summary, started_at, completed_at, triggered_by, share_token
         FROM scans WHERE target_id = $1 ORDER BY started_at DESC LIMIT 50`,
        [id],
    );
    json(res, 200, { target, scans });
}

async function handleVerify(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const { rows } = await pool.query('SELECT * FROM targets WHERE id = $1 AND user_id = $2', [id, user.userId]);
    const target = rows[0];
    if (!target) {
        error(res, 404, 'Target not found.');
        return;
    }
    if (target.verified) {
        json(res, 200, { verified: true, method: target.verification_method });
        return;
    }

    const result = await verifyDomainOwnership(target.hostname, target.verification_token);
    if (result.verified) {
        await pool.query(
            'UPDATE targets SET verified = true, verified_at = now(), verification_method = $2 WHERE id = $1',
            [id, result.method],
        );
    }
    json(res, 200, result);
}

async function handleGithub(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['POST', 'DELETE'])) return;

    const { rows } = await pool.query('SELECT id FROM targets WHERE id = $1 AND user_id = $2', [id, user.userId]);
    if (!rows[0]) {
        error(res, 404, 'Target not found.');
        return;
    }

    if (req.method === 'DELETE') {
        await pool.query(
            'UPDATE targets SET github_repo = NULL, github_token_encrypted = NULL, github_connected_at = NULL WHERE id = $1',
            [id],
        );
        json(res, 200, { disconnected: true });
        return;
    }

    if (!process.env.TOKEN_ENCRYPTION_KEY) {
        error(res, 501, 'The auto-fix feature is not configured on this deployment yet.');
        return;
    }

    const repo = clean(req.body?.repo, 200);
    const token = clean(req.body?.token, 500);
    if (!REPO_PATTERN.test(repo)) {
        error(res, 400, 'Enter the repo as "owner/repo".');
        return;
    }
    if (!token) {
        error(res, 400, 'Paste a GitHub personal access token.');
        return;
    }

    const [owner, repoName] = repo.split('/');
    try {
        await getRepo(token, owner, repoName);
    } catch (err) {
        if (err instanceof GitHubApiError && err.status === 404) {
            error(res, 400, `Couldn't access ${repo} with that token. Check the repo name and that the token has Contents + Pull requests permissions for it.`);
            return;
        }
        error(res, 502, err instanceof Error ? err.message : 'Could not verify GitHub access.');
        return;
    }

    await pool.query(
        `UPDATE targets SET github_repo = $2, github_token_encrypted = $3, github_connected_at = now() WHERE id = $1`,
        [id, repo, encryptSecret(token)],
    );
    json(res, 200, { connected: true, repo });
}
