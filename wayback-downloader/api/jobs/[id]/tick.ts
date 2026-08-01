import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { json, error, requireMethod } from '../../_lib/http.js';
import { archiveUrl, type Snapshot } from '../../_lib/cdx.js';
import { urlToFilepath } from '../../_lib/urlmap.js';
import {
    loadJobState,
    saveJobState,
    toPublicJobState,
    pushLog,
    filePath,
    type JobState,
} from '../../_lib/jobStore.js';

// Kept small and time-bounded so a single tick reliably finishes well
// within Vercel's function timeout, regardless of plan.
const BATCH_SIZE = 8;
const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 8000;

async function downloadOne(jobId: string, snap: Snapshot, allSnapshots: boolean, existing: Set<string>) {
    let relPath = urlToFilepath(snap.original);
    if (allSnapshots) {
        const [host, ...rest] = relPath.split('/');
        relPath = `${host}/${snap.timestamp}/${rest.join('/') || 'index.html'}`;
    }

    if (existing.has(relPath)) {
        return { kind: 'skip' as const, url: snap.original };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(archiveUrl(snap), { signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        const contentType = resp.headers.get('content-type') || 'application/octet-stream';

        const blob = await put(filePath(jobId, relPath), Buffer.from(buffer), {
            access: 'public',
            addRandomSuffix: false,
            contentType,
        });

        existing.add(relPath);
        return { kind: 'ok' as const, url: snap.original, name: relPath, blobUrl: blob.url, size: buffer.byteLength };
    } catch (err) {
        return { kind: 'error' as const, url: snap.original, message: (err as Error).message };
    } finally {
        clearTimeout(timer);
    }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
    let next = 0;
    async function runner() {
        while (next < items.length) {
            const index = next++;
            await worker(items[index], index);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
}

async function advance(state: JobState): Promise<void> {
    const existing = new Set(state.files.map((f) => f.name));
    const batch = state.snapshots.slice(state.cursor, state.cursor + BATCH_SIZE);

    const results = new Array<Awaited<ReturnType<typeof downloadOne>>>(batch.length);
    await runPool(batch, CONCURRENCY, async (snap, index) => {
        results[index] = await downloadOne(state.id, snap, state.params.allSnapshots, existing);
    });

    for (const result of results) {
        if (result.kind === 'ok') {
            state.completed += 1;
            state.files.push({ name: result.name, url: result.blobUrl, size: result.size });
            pushLog(state, { type: 'ok', url: result.url });
        } else if (result.kind === 'skip') {
            state.skipped += 1;
            pushLog(state, { type: 'skip', url: result.url });
        } else {
            state.failed += 1;
            pushLog(state, { type: 'error', url: result.url, message: result.message });
        }
    }

    state.cursor += batch.length;

    if (state.cursor >= state.total) {
        state.status = 'done';
        state.message =
            `Done! ${state.completed} file(s) downloaded` +
            (state.skipped ? `, ${state.skipped} skipped` : '') +
            (state.failed ? `, ${state.failed} failed` : '') +
            '.';
    } else {
        state.message = `Downloaded ${state.completed + state.failed + state.skipped}/${state.total} file(s)...`;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const id = String(req.query.id ?? '');
    const state = await loadJobState(id);
    if (!state) {
        error(res, 404, 'Job not found.');
        return;
    }

    if (state.status === 'done' || state.status === 'error' || state.status === 'cancelled') {
        json(res, 200, toPublicJobState(state));
        return;
    }

    if (state.cancelRequested) {
        state.status = 'cancelled';
        state.message = 'Cancelled.';
        await saveJobState(state);
        json(res, 200, toPublicJobState(state));
        return;
    }

    state.status = 'downloading';
    await advance(state);
    await saveJobState(state);
    json(res, 200, toPublicJobState(state));
}
