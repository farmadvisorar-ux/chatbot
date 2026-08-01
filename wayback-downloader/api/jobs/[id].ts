import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod, withErrorHandling } from '../_lib/http.js';
import { loadJobState, saveJobState, toPublicJobState } from '../_lib/jobStore.js';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    const id = String(req.query.id ?? '');
    const state = await loadJobState(id);
    if (!state) {
        error(res, 404, 'Job not found.');
        return;
    }

    if (req.method === 'POST') {
        // The only mutation this route supports is cancellation.
        if (state.status === 'downloading' || state.status === 'queued') {
            state.cancelRequested = true;
            await saveJobState(state);
        }
    }

    json(res, 200, toPublicJobState(state));
}

export default withErrorHandling(handler);
