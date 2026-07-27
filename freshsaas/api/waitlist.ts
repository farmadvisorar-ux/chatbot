import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { clean, validEmail } from './_lib/validate.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { checkRateLimit } from './_lib/rateLimit.js';

type WaitlistBody = { email?: string };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const pool = getPool();

    if (!(await checkRateLimit(pool, 'waitlist', clientKey(req), 10, 60))) {
        error(res, 429, 'Too many signups from this network. Try again later.');
        return;
    }

    const email = clean((req.body as WaitlistBody | undefined)?.email, 254).toLowerCase();
    if (!validEmail(email)) {
        error(res, 400, 'Enter a valid email address');
        return;
    }

    const existing = await pool.query('SELECT id FROM waitlist WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
        json(res, 200, { ok: true, alreadyJoined: true });
        return;
    }

    const inserted = await pool.query(
        'INSERT INTO waitlist (email, source) VALUES ($1, $2) RETURNING id',
        [email, 'FreshSAAS launch list'],
    );
    if (!inserted.rows[0]) {
        error(res, 500, 'Could not save email signup');
        return;
    }
    json(res, 200, { ok: true, alreadyJoined: false });
}
