import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../../_lib/http.js';
import { requireAuth } from '../../_lib/auth.js';
import { getPool } from '../../_lib/db.js';
import { clean } from '../../_lib/validate.js';
import { encryptSecret } from '../../_lib/crypto.js';
import { getRepo, GitHubApiError } from '../../../lib/github.js';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST', 'DELETE'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const pool = getPool();

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
