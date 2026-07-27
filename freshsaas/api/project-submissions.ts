import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { clean, validEmail, validUrl } from './_lib/validate.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { checkRateLimit } from './_lib/rateLimit.js';

type SubmissionBody = { product?: string; url?: string; promise?: string; email?: string };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const pool = getPool();

    if (!(await checkRateLimit(pool, 'project-submissions', clientKey(req), 5, 60))) {
        error(res, 429, 'Too many submissions from this network. Try again later.');
        return;
    }

    const input = (req.body || {}) as SubmissionBody;
    const product = clean(input.product, 200);
    const url = clean(input.url, 2048);
    const promise = clean(input.promise, 1000);
    const email = clean(input.email, 254).toLowerCase();

    if (!product || !promise || !email || !url) {
        error(res, 400, 'All submission fields are required');
        return;
    }
    if (!validEmail(email)) {
        error(res, 400, 'Enter a valid founder email');
        return;
    }
    if (!validUrl(url)) {
        error(res, 400, 'Enter a valid product URL');
        return;
    }

    const inserted = await pool.query(
        `INSERT INTO project_submissions (product, url, promise, email, status)
         VALUES ($1, $2, $3, $4, 'new') RETURNING id`,
        [product, url, promise, email],
    );
    if (!inserted.rows[0]) {
        error(res, 500, 'Could not save project submission');
        return;
    }
    json(res, 200, { ok: true, submissionId: inserted.rows[0].id });
}
