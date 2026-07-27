import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { clean, validEmail, validUrl } from './_lib/validate.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { insertCandidates, dedupKey } from './_lib/directory.js';
import { sendListedEmail } from './_lib/email.js';

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
         VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
        [product, url, promise, email],
    );
    const submissionId = inserted.rows[0]?.id;
    if (!submissionId) {
        error(res, 500, 'Could not save project submission');
        return;
    }

    // Submissions publish immediately with no human review. insertCandidates
    // still applies the automated gate (valid URL, length limits, banned
    // terms), and anything that slips past it is removed from the admin
    // dashboard after the fact rather than held back before.
    const added = await insertCandidates(pool, [{
        name: product,
        tagline: promise,
        description: `${promise}. Submitted by its founder to FreshSAAS.`,
        url,
        category: 'Founder submission',
        tags: ['Founder submission', 'New launch'],
        source: 'FreshSAAS submission',
        sourceUrl: url,
        status: 'live',
    }]);

    const entry = await pool.query('SELECT id FROM directory_entries WHERE dedup_key = $1', [dedupKey(product, url)]);
    const entryId = entry.rows[0]?.id ?? null;
    await pool.query(
        'UPDATE project_submissions SET published_entry_id = $2, reviewed_at = now() WHERE id = $1',
        [submissionId, entryId],
    );

    if (added > 0) {
        await sendListedEmail(email, product, url);
    }

    json(res, 200, { ok: true, submissionId, published: added > 0 });
}
