import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, clientKey } from '../_lib/http.js';
import { validUrl, clean } from '../_lib/validate.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { generateVerificationToken } from '../_lib/verification.js';
import { hasActiveAccess } from '../_lib/stripe.js';
import { normalizeTargetUrl } from '../../lib/scanner/engine.js';

const FREE_TARGET_LIMIT = 1;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const pool = getPool();

    if (req.method === 'GET') {
        const { rows } = await pool.query(
            `SELECT t.*, s.subscription_status
             FROM targets t JOIN users s ON s.id = t.user_id
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
