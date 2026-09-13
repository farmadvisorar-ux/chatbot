import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../_lib/http.js';
import { clean } from '../_lib/validate.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { verifyDomainOwnership } from '../_lib/verification.js';
import { siteOrigin } from '../_lib/site.js';
import { encryptSecret } from '../_lib/crypto.js';
import { tierForUser } from '../_lib/tier.js';
import { detectWebhookKind, validateWebhookUrl, deliverWebhook } from '../_lib/notify.js';
import { getRepo, GitHubApiError } from '../../lib/github.js';
import { renderBadgeSvg } from '../_lib/badge.js';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * Single dynamic segment only — `[[...segments]].ts` / `[...segments].ts`
 * catch-alls were tried here first, but this deployment's build generates a
 * route regex for bracket catch-alls that only ever matches exactly one path
 * segment (effectively identical to `[id].ts`), so a second path segment
 * like `/verify` or `/github` 404s before reaching the function. Extra
 * actions are dispatched via `?action=` on this single-segment route
 * instead of extra path segments:
 *   (no action)      -> GET detail / DELETE
 *   ?action=verify    -> POST check ownership verification
 *   ?action=github    -> POST connect / DELETE disconnect GitHub repo
 *   ?action=webhook   -> POST set / DELETE remove the Slack/Discord/generic alert webhook
 *   ?action=badge-svg  -> GET embeddable trust badge image (public)
 *   ?action=badge-info -> GET public verification summary (public)
 * The badge actions are checked before requireAuth: they're meant to be
 * fetched by an <img> tag on a third-party site or the public verify.html
 * page, neither of which carries a Clerk session.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const action = typeof req.query.action === 'string' ? req.query.action : '';

    if (action === 'badge-svg') {
        await handleBadgeSvg(req, res, getPool(), id);
        return;
    }
    if (action === 'badge-info') {
        await handleBadgeInfo(req, res, getPool(), id);
        return;
    }

    const user = await requireAuth(req, res);
    if (!user) return;
    const pool = getPool();

    if (action === 'verify') {
        await handleVerify(req, res, user, pool, id);
        return;
    }
    if (action === 'github') {
        await handleGithub(req, res, user, pool, id);
        return;
    }
    if (action === 'webhook') {
        await handleWebhook(req, res, user, pool, id);
        return;
    }
    if (action) {
        error(res, 404, 'Not found.');
        return;
    }
    await handleSingle(req, res, user, pool, id);
}

interface BadgeState {
    hostname: string; label: string | null; verified: boolean; auto_rescan: boolean;
    grade: string | null; score: number | null; started_at: string | null;
}

async function loadBadgeState(pool: ReturnType<typeof getPool>, id: string): Promise<BadgeState | null> {
    const { rows } = await pool.query(
        `SELECT t.hostname, t.label, t.verified, t.auto_rescan,
                latest.grade, latest.score, latest.started_at
         FROM targets t
         LEFT JOIN LATERAL (
             SELECT grade, score, started_at FROM scans
             WHERE target_id = t.id AND status = 'completed'
             ORDER BY started_at DESC LIMIT 1
         ) latest ON true
         WHERE t.id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

async function handleBadgeSvg(req: VercelRequest, res: VercelResponse, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    let state: BadgeState | null;
    try {
        state = await loadBadgeState(pool, id);
    } catch {
        state = null;
    }
    if (!state) {
        res.status(404).end();
        return;
    }
    const dateLabel = state.started_at ? new Date(state.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
    res.status(200).send(renderBadgeSvg({ verified: state.verified, grade: state.grade, dateLabel }));
}

async function handleBadgeInfo(req: VercelRequest, res: VercelResponse, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    let state: BadgeState | null;
    try {
        state = await loadBadgeState(pool, id);
    } catch {
        state = null;
    }
    if (!state) {
        error(res, 404, 'Not found.');
        return;
    }
    res.setHeader('Cache-Control', 'public, max-age=600');
    json(res, 200, {
        hostname: state.hostname,
        label: state.label,
        verified: state.verified,
        grade: state.grade,
        score: state.score,
        lastScannedAt: state.started_at,
        autoRescan: state.auto_rescan,
        badgeUrl: `${siteOrigin()}/api/targets/${id}?action=badge-svg`,
        verifyUrl: `${siteOrigin()}/verify.html?t=${id}`,
    });
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
        // next_rescan_at is what puts a site into the cron's rotation, and it
        // was previously only ever written after a scan finished — so a site
        // that verified but was never manually scanned stayed NULL forever and
        // the cron's `next_rescan_at IS NOT NULL` guard skipped it for good.
        // Automatic re-audits are promised on every plan including Free, so
        // arm the schedule the moment ownership is proven: due immediately,
        // which makes the first audit land on the next cron run.
        await pool.query(
            `UPDATE targets SET verified = true, verified_at = now(), verification_method = $2,
                    next_rescan_at = COALESCE(next_rescan_at, now())
             WHERE id = $1`,
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

/**
 * Sets or clears the alert webhook for one site.
 *
 * The destination is proved before it is stored: a test alert is delivered
 * synchronously and a non-2xx response is returned to the caller as an error.
 * A webhook that was never going to work is worth failing loudly at setup,
 * when someone is watching, rather than at 3am during the incident it was
 * meant to announce.
 */
async function handleWebhook(req: VercelRequest, res: VercelResponse, user: { userId: string }, pool: ReturnType<typeof getPool>, id: string): Promise<void> {
    if (!requireMethod(req, res, ['POST', 'DELETE'])) return;

    const { rows } = await pool.query(
        'SELECT id, hostname, label FROM targets WHERE id = $1 AND user_id = $2',
        [id, user.userId],
    );
    const target = rows[0];
    if (!target) {
        error(res, 404, 'Target not found.');
        return;
    }

    if (req.method === 'DELETE') {
        await pool.query(
            `UPDATE targets SET webhook_url = NULL, webhook_kind = NULL, webhook_secret_encrypted = NULL,
                    webhook_failed_at = NULL, webhook_last_error = NULL
             WHERE id = $1`,
            [id],
        );
        json(res, 200, { removed: true });
        return;
    }

    const limits = await tierForUser(pool, user.userId);
    if (!limits.webhookAlerts) {
        error(res, 402, 'Slack, Discord and webhook alerts are part of the Growth plan.');
        return;
    }
    if (!process.env.TOKEN_ENCRYPTION_KEY) {
        error(res, 501, 'Webhook alerts are not configured on this deployment yet.');
        return;
    }

    const validated = validateWebhookUrl(clean(req.body?.url, 500));
    if (!validated.ok) {
        error(res, 400, validated.reason);
        return;
    }

    const kind = detectWebhookKind(validated.url);
    // Slack and Discord authenticate by the unguessable URL itself, so a
    // second shared secret would be ceremony with nothing behind it. Only a
    // customer's own receiver gets one.
    const secret = kind === 'generic' ? randomBytes(32).toString('base64url') : null;
    const name = target.label || target.hostname;

    const test = await deliverWebhook({ url: validated.url, kind, secret }, {
        event: 'changes',
        site: name,
        hostname: target.hostname,
        heading: 'Webhook connected',
        intro: `This is a test alert from AuditPulse. Security alerts for ${name} will arrive here.`,
        items: ['New issues found by an audit', 'TLS certificate expiry warnings', 'Security header and third-party script changes', 'New subdomains seen in Certificate Transparency logs'],
        reportUrl: `${siteOrigin()}/dashboard.html`,
    });
    if (!test.ok) {
        error(res, 400, `Could not deliver a test alert: ${test.error ?? 'the endpoint did not accept it'}.`);
        return;
    }

    await pool.query(
        `UPDATE targets SET webhook_url = $2, webhook_kind = $3, webhook_secret_encrypted = $4,
                webhook_failed_at = NULL, webhook_last_error = NULL
         WHERE id = $1`,
        [id, validated.url, kind, secret ? encryptSecret(secret) : null],
    );

    // The signing secret is returned exactly once. It is stored encrypted and
    // never read back out to the customer again.
    json(res, 200, { connected: true, kind, secret });
}
