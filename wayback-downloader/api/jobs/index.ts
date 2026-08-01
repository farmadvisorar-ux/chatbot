import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { json, error, requireMethod, bodyOf, withErrorHandling } from '../_lib/http.js';
import { parseParams, BadRequest } from '../_lib/params.js';
import { fetchSnapshots, filterSnapshots, CdxError } from '../_lib/cdx.js';
import { newJobState, saveJobState, toPublicJobState } from '../_lib/jobStore.js';

// Leaves buffer under this function's maxDuration (see vercel.json) so a
// slow CDX API is caught here as a clean error instead of the whole
// invocation being killed by Vercel's hard timeout.
const CDX_TIMEOUT_MS = 30000;

function randomId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    let params;
    try {
        params = parseParams(bodyOf(req));
    } catch (err) {
        if (err instanceof BadRequest) {
            error(res, 400, err.message);
            return;
        }
        throw err;
    }

    const id = randomId();
    const state = newJobState(id, params);

    try {
        let snapshots = await fetchSnapshots(
            params.domain,
            {
                fromTs: params.fromTs,
                toTs: params.toTs,
                exactUrl: params.exactUrl,
                onlyStatus200: params.onlyStatus200,
                allSnapshots: params.allSnapshots,
            },
            CDX_TIMEOUT_MS,
        );
        snapshots = filterSnapshots(snapshots, {
            extensions: params.extensions.length ? params.extensions : null,
            onlyPattern: params.onlyPattern,
            excludePattern: params.excludePattern,
        });

        const truncated = snapshots.length > params.maxFiles;
        if (truncated) snapshots = snapshots.slice(0, params.maxFiles);

        state.snapshots = snapshots;
        state.total = snapshots.length;

        if (state.total === 0) {
            state.status = 'done';
            state.message = 'No matching snapshots were found.';
        } else {
            state.status = 'downloading';
            state.message = `Found ${state.total} file(s)${truncated ? ` (capped at ${params.maxFiles})` : ''}. Starting download...`;
        }
    } catch (err) {
        if (err instanceof CdxError) {
            state.status = 'error';
            state.error = err.message;
            state.message = 'Could not list snapshots.';
        } else {
            throw err;
        }
    }

    await saveJobState(state);
    json(res, 201, toPublicJobState(state));
}

export default withErrorHandling(handler);
