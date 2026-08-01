import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';
import { json, error, requireMethod, withErrorHandling } from '../_lib/http.js';
import { deleteJob, type JobState } from '../_lib/jobStore.js';

const JOB_TTL_MS = Number(process.env.WMD_JOB_TTL_HOURS || 24) * 60 * 60 * 1000;

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    // Vercel Cron calls this with a bearer token matching CRON_SECRET.
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        error(res, 401, 'Unauthorized');
        return;
    }

    const cutoff = Date.now() - JOB_TTL_MS;
    const seen = new Set<string>();
    let removed = 0;
    let cursor: string | undefined;

    do {
        const page = await list({ prefix: 'jobs/', cursor, limit: 1000 });
        for (const b of page.blobs) {
            const match = b.pathname.match(/^jobs\/([^/]+)\/state\.json$/);
            if (!match || seen.has(match[1])) continue;
            seen.add(match[1]);

            try {
                const stateRes = await fetch(b.url, { cache: 'no-store' });
                const state = (await stateRes.json()) as JobState;
                if (state.createdAt < cutoff) {
                    await deleteJob(match[1]);
                    removed += 1;
                }
            } catch {
                // A job with an unreadable state file is orphaned either way; skip it this run.
            }
        }
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    json(res, 200, { ok: true, removed });
}

export default withErrorHandling(handler);
