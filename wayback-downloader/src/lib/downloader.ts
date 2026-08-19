import { archiveUrl, type Snapshot } from './cdx';
import { urlToFilepath } from './urlmap';

export interface DownloadedFile {
    name: string;
    blob: Blob;
    size: number;
}

export interface DownloadProgress {
    completed: number;
    failed: number;
    skipped: number;
    total: number;
}

export interface DownloadEvent {
    type: 'ok' | 'error' | 'skip';
    url: string;
    message?: string;
}

export interface DownloadOptions {
    concurrency?: number;
    allSnapshots?: boolean;
    timeoutMs?: number;
    onEvent?: (event: DownloadEvent, progress: DownloadProgress) => void;
    isCancelled?: () => boolean;
}

export interface DownloadResult {
    files: DownloadedFile[];
    completed: number;
    failed: number;
    skipped: number;
    cancelled: boolean;
}

function targetPath(snap: Snapshot, allSnapshots: boolean): string {
    const relPath = urlToFilepath(snap.original);
    if (!allSnapshots) return relPath;
    const [host, ...rest] = relPath.split('/');
    return `${host}/${snap.timestamp}/${rest.join('/') || 'index.html'}`;
}

/** Downloads every snapshot directly from the browser (not through a
 * server), so requests go out on the visitor's own network rather than a
 * datacenter IP range that archive.org may throttle or drop. */
export async function downloadSnapshots(snapshots: Snapshot[], opts: DownloadOptions = {}): Promise<DownloadResult> {
    const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 12));
    const timeoutMs = opts.timeoutMs ?? 15000;
    const total = snapshots.length;

    const files: DownloadedFile[] = [];
    const seen = new Set<string>();
    let completed = 0;
    let failed = 0;
    let skipped = 0;

    const emit = (event: DownloadEvent) => {
        opts.onEvent?.(event, { completed, failed, skipped, total });
    };

    async function downloadOne(snap: Snapshot): Promise<void> {
        const relPath = targetPath(snap, Boolean(opts.allSnapshots));

        if (seen.has(relPath)) {
            skipped += 1;
            emit({ type: 'skip', url: snap.original });
            return;
        }
        seen.add(relPath);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(archiveUrl(snap), { signal: controller.signal });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            files.push({ name: relPath, blob, size: blob.size });
            completed += 1;
            emit({ type: 'ok', url: snap.original });
        } catch (err) {
            failed += 1;
            emit({ type: 'error', url: snap.original, message: (err as Error).message });
        } finally {
            clearTimeout(timer);
        }
    }

    let next = 0;
    let cancelled = false;
    async function worker(): Promise<void> {
        while (next < snapshots.length) {
            if (opts.isCancelled?.()) {
                cancelled = true;
                return;
            }
            const snap = snapshots[next++];
            await downloadOne(snap);
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, snapshots.length) }, worker));

    return { files, completed, failed, skipped, cancelled };
}
