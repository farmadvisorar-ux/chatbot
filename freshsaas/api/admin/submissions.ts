import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { clean } from '../_lib/validate.js';
import { insertCandidates, dedupKey } from '../_lib/directory.js';
import { sendListedEmail } from '../_lib/email.js';

/**
 * Review queue for founder submissions.
 *
 *   GET  /api/admin/submissions            -> pending submissions
 *   POST /api/admin/submissions {id, action:'approve'|'reject'}
 *
 * Approving publishes straight to the live directory, so an approved product
 * appears on the site without any further step.
 *
 * Guarded by ADMIN_SECRET rather than a user role: there is no admin UI or
 * role system yet, and a shared secret is honest about that rather than
 * implying per-user permissions that don't exist.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
        error(res, 501, 'Admin access is not configured');
        return;
    }
    if (req.headers.authorization?.replace(/^Bearer\s+/i, '') !== secret) {
        error(res, 401, 'Unauthorized');
        return;
    }

    const pool = getPool();

    if (req.method === 'GET') {
        const { rows } = await pool.query(
            `SELECT id, product, url, promise, email, status, submitted_at AS "submittedAt"
             FROM project_submissions WHERE status = 'new'
             ORDER BY submitted_at ASC LIMIT 200`,
        );
        json(res, 200, { submissions: rows });
        return;
    }

    const body = (req.body || {}) as { id?: string; action?: string };
    const id = clean(body.id, 64);
    const action = clean(body.action, 20);
    if (!id || (action !== 'approve' && action !== 'reject')) {
        error(res, 400, "Provide an id and action of 'approve' or 'reject'");
        return;
    }

    const found = await pool.query(
        `SELECT id, product, url, promise, email, status, published_entry_id
         FROM project_submissions WHERE id = $1`,
        [id],
    );
    const submission = found.rows[0];
    if (!submission) {
        error(res, 404, 'Submission not found');
        return;
    }
    if (submission.published_entry_id) {
        json(res, 200, { ok: true, alreadyPublished: true });
        return;
    }

    if (action === 'reject') {
        await pool.query(`UPDATE project_submissions SET status = 'rejected', reviewed_at = now() WHERE id = $1`, [id]);
        json(res, 200, { ok: true, status: 'rejected' });
        return;
    }

    const added = await insertCandidates(pool, [{
        name: submission.product,
        tagline: submission.promise,
        description: `${submission.promise}. Submitted by its founder to FreshSAAS.`,
        url: submission.url,
        category: 'Founder submission',
        tags: ['Founder submission', 'New launch'],
        source: 'FreshSAAS submission',
        sourceUrl: submission.url,
        status: 'live',
    }]);

    // insertCandidates skips duplicates, so resolve the row either way to
    // record the link back and keep approval idempotent.
    const entry = await pool.query('SELECT id FROM directory_entries WHERE dedup_key = $1', [
        dedupKey(submission.product, submission.url),
    ]);
    const entryId = entry.rows[0]?.id ?? null;

    await pool.query(
        `UPDATE project_submissions SET status = 'approved', reviewed_at = now(), published_entry_id = $2 WHERE id = $1`,
        [id, entryId],
    );

    // Only notify on the run that actually published, so re-approving an
    // already-listed submission doesn't email the founder twice.
    if (added > 0 && submission.email) {
        await sendListedEmail(submission.email, submission.product, submission.url);
    }

    json(res, 200, { ok: true, status: 'approved', published: added > 0, entryId });
}
