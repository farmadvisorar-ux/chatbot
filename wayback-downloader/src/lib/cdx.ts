/**
 * Client for the Wayback Machine CDX Server API.
 * See https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md
 */

const CDX_API_URL = 'https://web.archive.org/cdx/search/cdx';
const FIELDS = ['timestamp', 'original', 'statuscode', 'digest', 'mimetype'];

export class CdxError extends Error {}

export interface Snapshot {
    timestamp: string;
    original: string;
    statuscode: string;
    digest: string;
    mimetype: string;
}

export function archiveUrl(snapshot: Pick<Snapshot, 'timestamp' | 'original'>): string {
    return `https://web.archive.org/web/${snapshot.timestamp}id_/${snapshot.original}`;
}

export interface CdxQueryOptions {
    fromTs?: string | null;
    toTs?: string | null;
    exactUrl?: boolean;
    onlyStatus200?: boolean;
    allSnapshots?: boolean;
    limit?: number;
}

export function buildCdxParams(domain: string, opts: CdxQueryOptions = {}): URLSearchParams {
    const params = new URLSearchParams({
        url: domain.trim(),
        output: 'json',
        fl: FIELDS.join(','),
        matchType: opts.exactUrl ? 'exact' : 'domain',
    });
    if (opts.fromTs) params.set('from', opts.fromTs);
    if (opts.toTs) params.set('to', opts.toTs);
    if (opts.onlyStatus200 ?? true) params.set('filter', 'statuscode:200');
    if (!opts.allSnapshots) params.set('collapse', 'urlkey');
    if (opts.limit) params.set('limit', String(opts.limit));
    return params;
}

export function parseCdxJson(data: unknown): Snapshot[] {
    if (!Array.isArray(data) || data.length < 2) return [];
    const [header, ...rows] = data as [string[], ...unknown[][]];
    const index: Record<string, number> = {};
    header.forEach((name, i) => {
        index[name] = i;
    });

    const get = (row: unknown[], name: string): string => {
        const i = index[name];
        if (i === undefined || i >= row.length) return '';
        return String(row[i] ?? '');
    };

    return rows
        .map((row) => ({
            timestamp: get(row, 'timestamp'),
            original: get(row, 'original'),
            statuscode: get(row, 'statuscode'),
            digest: get(row, 'digest'),
            mimetype: get(row, 'mimetype'),
        }))
        .filter((s) => s.timestamp && s.original);
}

async function fetchOnce(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchSnapshots(
    domain: string,
    opts: CdxQueryOptions = {},
    timeoutMs = 20000,
): Promise<Snapshot[]> {
    if (!domain || !domain.trim()) {
        throw new CdxError('Please provide a domain or URL to look up.');
    }

    const params = buildCdxParams(domain, opts);
    const url = `${CDX_API_URL}?${params.toString()}`;

    // A reset or hung connection can be transient network flakiness rather
    // than a hard block, so one retry (splitting the time budget) is worth
    // it before giving up.
    const perAttemptTimeout = Math.max(5000, Math.floor(timeoutMs / 2));
    let response: Response;
    try {
        response = await fetchOnce(url, perAttemptTimeout);
    } catch {
        try {
            response = await fetchOnce(url, perAttemptTimeout);
        } catch (err) {
            throw new CdxError(`Could not reach the Wayback Machine CDX API: ${(err as Error).message}`);
        }
    }

    if (!response.ok) {
        throw new CdxError(`The CDX API returned HTTP ${response.status}.`);
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch {
        throw new CdxError('The CDX API returned an unexpected response.');
    }

    return parseCdxJson(data);
}

export interface FilterOptions {
    extensions?: string[] | null;
    onlyPattern?: string | null;
    excludePattern?: string | null;
}

export function filterSnapshots(snapshots: Snapshot[], opts: FilterOptions = {}): Snapshot[] {
    let result = snapshots;

    if (opts.extensions && opts.extensions.length > 0) {
        const exts = opts.extensions.map((e) => `.${e.replace(/^\./, '').toLowerCase()}`);
        result = result.filter((s) => {
            const path = s.original.toLowerCase().split('?')[0];
            return exts.some((ext) => path.endsWith(ext));
        });
    }

    if (opts.onlyPattern) {
        const rx = new RegExp(opts.onlyPattern);
        result = result.filter((s) => rx.test(s.original));
    }

    if (opts.excludePattern) {
        const rx = new RegExp(opts.excludePattern);
        result = result.filter((s) => !rx.test(s.original));
    }

    return result;
}
