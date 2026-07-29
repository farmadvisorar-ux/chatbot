import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../../_lib/http.js';
import { requireAuth } from '../../_lib/auth.js';
import { getPool } from '../../_lib/db.js';
import { hasFixAccess } from '../../_lib/stripe.js';
import { decryptSecret } from '../../_lib/crypto.js';
import { getRepo, GitHubApiError } from '../../../lib/github.js';
import { applyFix, FixNotApplicableError } from '../../../lib/fixers/index.js';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const pool = getPool();

    const { rows: userRows } = await pool.query('SELECT subscription_status, plan FROM users WHERE id = $1', [user.userId]);
    if (!hasFixAccess(userRows[0]?.subscription_status, userRows[0]?.plan)) {
        error(res, 402, 'Automatic fixes require the Audit + Fix plan ($14/mo). Upgrade from your account page.');
        return;
    }

    const { rows } = await pool.query(
        `SELECT f.*, t.id AS target_id, t.github_repo, t.github_token_encrypted
         FROM findings f
         JOIN scans s ON s.id = f.scan_id
         JOIN targets t ON t.id = s.target_id
         WHERE f.id = $1 AND s.user_id = $2`,
        [id, user.userId],
    );
    const finding = rows[0];
    if (!finding) {
        error(res, 404, 'Finding not found.');
        return;
    }
    if (!finding.auto_fixable) {
        error(res, 400, "This finding doesn't have an automatic fix — see the remediation steps instead.");
        return;
    }
    if (!finding.github_repo || !finding.github_token_encrypted) {
        error(res, 400, 'Connect a GitHub repo on this site first.');
        return;
    }

    const [owner, repo] = finding.github_repo.split('/');
    let token: string;
    try {
        token = decryptSecret(finding.github_token_encrypted);
    } catch {
        error(res, 500, 'Could not decrypt the stored GitHub token. Reconnect the repo.');
        return;
    }

    try {
        const repoInfo = await getRepo(token, owner, repo);
        const result = await applyFix({
            token, owner, repo,
            defaultBranch: repoInfo.defaultBranch,
            finding: {
                checkId: finding.check_id,
                title: finding.title,
                evidence: finding.evidence,
                affectedUrl: finding.affected_url,
            },
        });
        await pool.query(
            `UPDATE findings SET fix_status = 'pr_open', fix_pr_url = $2, fix_error = NULL WHERE id = $1`,
            [id, result.prUrl],
        );
        json(res, 200, { prUrl: result.prUrl });
    } catch (err) {
        const message = err instanceof FixNotApplicableError ? err.message
            : err instanceof GitHubApiError ? `GitHub error: ${err.message}`
            : err instanceof Error ? err.message : 'Could not open a fix PR.';
        await pool.query(`UPDATE findings SET fix_status = 'failed', fix_error = $2 WHERE id = $1`, [id, message]);
        error(res, 422, message);
    }
}
