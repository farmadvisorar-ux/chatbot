import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod, bodyOf } from './_lib/http.js';
import { parseParams, BadRequest } from './_lib/params.js';
import { fetchSnapshots, filterSnapshots, CdxError } from './_lib/cdx.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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

    let snapshots;
    try {
        snapshots = await fetchSnapshots(params.domain, {
            fromTs: params.fromTs,
            toTs: params.toTs,
            exactUrl: params.exactUrl,
            onlyStatus200: params.onlyStatus200,
            allSnapshots: params.allSnapshots,
        });
    } catch (err) {
        if (err instanceof CdxError) {
            error(res, 502, err.message);
            return;
        }
        throw err;
    }

    snapshots = filterSnapshots(snapshots, {
        extensions: params.extensions.length ? params.extensions : null,
        onlyPattern: params.onlyPattern,
        excludePattern: params.excludePattern,
    });

    json(res, 200, {
        count: snapshots.length,
        sample: snapshots.slice(0, 25).map((s) => ({ url: s.original, timestamp: s.timestamp, mimetype: s.mimetype })),
        truncatedAt: snapshots.length > params.maxFiles ? params.maxFiles : null,
    });
}
