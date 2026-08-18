import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod, clientKey } from './_lib/http.js';
import { validEmail, clean } from './_lib/validate.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { getPool } from './_lib/db.js';

/** One year. The cookie only records "this visitor already gave us an email" — it carries no identifier. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const COOKIE_NAME = 'ap_ew';

function setSuppressionCookie(res: VercelResponse): void {
    res.setHeader('Set-Cookie',
        `${COOKIE_NAME}=1; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure; HttpOnly`);
}

function hasSuppressionCookie(req: VercelRequest): boolean {
    return (req.headers.cookie ?? '').split(';').some(part => part.trim().startsWith(`${COOKIE_NAME}=`));
}

/**
 * Landing-page email wall.
 *
 *   GET  -> { known: boolean }  Should the wall stay hidden for this visitor?
 *   POST -> { ok: true }        Record an email and suppress the wall.
 *
 * Suppression is checked two ways: the cookie (fast, survives IP changes on
 * the same browser) and a lookup by client IP (survives cleared cookies and
 * a second browser on the same connection). Either one is enough. The IP
 * fallback is deliberately coarse — shared NATs mean one person's submission
 * can suppress the prompt for others behind the same address, which is the
 * right trade for a marketing prompt but would not be acceptable for auth.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    if (!process.env.DATABASE_URL) {
        // Without a database we can still honour the cookie, so the wall
        // doesn't nag a visitor who already dismissed it via submission.
        if (req.method === 'GET') {
            json(res, 200, { known: hasSuppressionCookie(req) });
            return;
        }
        setSuppressionCookie(res);
        json(res, 200, { ok: true, stored: false });
        return;
    }

    const pool = getPool();
    const ip = clientKey(req);

    if (req.method === 'GET') {
        if (hasSuppressionCookie(req)) {
            json(res, 200, { known: true });
            return;
        }
        try {
            const { rows } = await pool.query(
                'SELECT 1 FROM email_captures WHERE ip = $1 LIMIT 1',
                [ip],
            );
            json(res, 200, { known: rows.length > 0 });
        } catch {
            // A database hiccup should never wall off the page; fail open.
            json(res, 200, { known: false });
        }
        return;
    }

    const email = clean(req.body?.email, 254);
    if (!validEmail(email)) {
        error(res, 400, 'Enter a valid email address.');
        return;
    }

    try {
        const allowed = await checkRateLimit(pool, 'email-capture', ip, 5, 60);
        if (!allowed) {
            error(res, 429, 'Too many attempts from this connection. Try again shortly.');
            return;
        }
    } catch {
        // Rate limiting is best-effort.
    }

    const userAgent = clean(req.headers['user-agent'], 500) || null;
    try {
        await pool.query(
            `INSERT INTO email_captures (email, ip, user_agent)
             VALUES ($1, $2, $3)
             ON CONFLICT (lower(email)) DO UPDATE SET ip = EXCLUDED.ip, last_seen_at = now()`,
            [email, ip, userAgent],
        );
    } catch (err) {
        console.error('Email capture failed:', err);
        error(res, 502, 'Could not save your email. Please try again.');
        return;
    }

    setSuppressionCookie(res);
    json(res, 200, { ok: true });
}
