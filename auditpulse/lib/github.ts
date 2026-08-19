/**
 * Minimal GitHub REST API client used by the auto-fix feature. Deliberately
 * thin (no @octokit dependency) — just enough to read a file, commit a
 * change on a new branch, and open a pull request, all with the fine-grained
 * PAT the user pastes in for a single repo (api/targets/[id]/github.ts).
 */

const API = 'https://api.github.com';

export class GitHubApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function gh<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'AuditPulseBot/1.0',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) throw new GitHubApiError(404, 'Not found');
    if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new GitHubApiError(res.status, (detail as { message?: string }).message || `GitHub API error (${res.status})`);
    }
    return res.status === 204 ? (undefined as T) : await res.json() as T;
}

export interface RepoInfo { defaultBranch: string; fullName: string }

export async function getRepo(token: string, owner: string, repo: string): Promise<RepoInfo> {
    const data = await gh<{ default_branch: string; full_name: string }>(token, 'GET', `/repos/${owner}/${repo}`);
    return { defaultBranch: data.default_branch, fullName: data.full_name };
}

export interface RepoFile { sha: string; content: string }

/** Fetches a file's decoded text content, or null if it doesn't exist in this repo. */
export async function getFile(token: string, owner: string, repo: string, path: string, ref: string): Promise<RepoFile | null> {
    try {
        const data = await gh<{ sha: string; content: string; encoding: string }>(
            token, 'GET', `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
        );
        return { sha: data.sha, content: Buffer.from(data.content, data.encoding as BufferEncoding).toString('utf8') };
    } catch (err) {
        if (err instanceof GitHubApiError && err.status === 404) return null;
        throw err;
    }
}

/** True if `path` exists in the repo (file or directory) — used for lightweight stack detection before attempting a fix. */
export async function pathExists(token: string, owner: string, repo: string, path: string, ref: string): Promise<boolean> {
    const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'AuditPulseBot/1.0' },
    });
    return res.ok;
}

export async function getBranchSha(token: string, owner: string, repo: string, branch: string): Promise<string> {
    const data = await gh<{ object: { sha: string } }>(token, 'GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return data.object.sha;
}

export async function createBranch(token: string, owner: string, repo: string, newBranch: string, fromSha: string): Promise<void> {
    await gh(token, 'POST', `/repos/${owner}/${repo}/git/refs`, { ref: `refs/heads/${newBranch}`, sha: fromSha });
}

export async function putFile(token: string, owner: string, repo: string, params: {
    path: string; content: string; message: string; branch: string; sha?: string;
}): Promise<void> {
    await gh(token, 'PUT', `/repos/${owner}/${repo}/contents/${params.path}`, {
        message: params.message,
        content: Buffer.from(params.content, 'utf8').toString('base64'),
        branch: params.branch,
        ...(params.sha ? { sha: params.sha } : {}),
    });
}

export async function createPullRequest(token: string, owner: string, repo: string, params: {
    title: string; body: string; head: string; base: string;
}): Promise<{ url: string }> {
    const data = await gh<{ html_url: string }>(token, 'POST', `/repos/${owner}/${repo}/pulls`, params);
    return { url: data.html_url };
}
