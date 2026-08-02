/**
 * Client for the Wayback Machine CDX Server API, run from the browser.
 *
 * This deliberately mirrors wayback-downloader/src/lib/cdx.ts's approach in
 * this same repo: that project found requests to web.archive.org from
 * serverless/datacenter IPs get silently dropped or reset, and fixed it by
 * making every Wayback request directly from the visitor's browser instead
 * of a server. Listing snapshots is exactly that kind of request, so it
 * belongs here (src/), not in api/ — see api/_lib/archive.ts for the one
 * request this project still makes server-side (the actual snapshot fetch
 * for sanitizing + deploying), which is a separate, documented risk.
 */

const CDX_API_URL = 'https://web.archive.org/cdx/search/cdx';

export class CdxError extends Error {}

export interface Snapshot {
    timestamp: string;
    statuscode: string;
}

/**
 * Exact-match lookups are fast, indexed-by-SURT-key operations regardless of
 * how large the overall site is. A domain-wide match (matchType: 'domain')
 * plus a server-side regex filter was tried first, but for a site the size
 * of walmart.com that forces the CDX server to scan the site's entire page
 * history before it can apply the filter, and reliably times out. Two exact
 * queries (bare host + www-prefixed) stay fast at any site size, at the cost
 * of only covering those two variants — root pages archived under some other
 * subdomain won't show up, which is an acceptable trade-off for speed here.
 */
function buildCdxParams(url: string): URLSearchParams {
    return new URLSearchParams({
        url,
        matchType: 'exact',
        output: 'json',
        fl: 'timestamp,statuscode',
        filter: 'statuscode:200',
        limit: '1000',
    });
}

export function parseCdxJson(data: unknown): Snapshot[] {
    if (!Array.isArray(data) || data.length < 2) return [];
    const [, ...rows] = data as [string[], ...unknown[][]];
    return rows
        .map((row) => ({ timestamp: String(row[0] ?? ''), statuscode: String(row[1] ?? '') }))
        .filter((s) => s.timestamp);
}

/** Collapses to one capture per calendar day and sorts newest-first. */
export function collapseToDaily(snapshots: Snapshot[]): Snapshot[] {
    const byDay = new Map<string, Snapshot>();
    for (const snapshot of snapshots) {
        const day = snapshot.timestamp.slice(0, 8);
        if (!byDay.has(day)) byDay.set(day, snapshot);
    }
    return [...byDay.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

async function fetchOne(url: string, signal: AbortSignal): Promise<Snapshot[]> {
    const apiUrl = `${CDX_API_URL}?${buildCdxParams(url).toString()}`;
    const response = await fetch(apiUrl, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new CdxError(`The CDX API returned HTTP ${response.status}.`);

    // The CDX API returns a genuinely empty body (not "[]") when nothing matches.
    const text = await response.text();
    if (!text.trim()) return [];

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new CdxError('The CDX API returned an unexpected response.');
    }
    return parseCdxJson(data);
}

export async function fetchSnapshots(domain: string, timeoutMs = 20000): Promise<Snapshot[]> {
    const trimmed = domain.trim();
    if (!trimmed) throw new CdxError('Please provide a domain to look up.');

    const bare = trimmed.replace(/^www\./i, '');
    const variants = [bare, `www.${bare}`];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const results = await Promise.allSettled(variants.map((v) => fetchOne(v, controller.signal)));
        const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Snapshot[]>[];
        if (!fulfilled.length) {
            const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
            const reason = firstError?.reason;
            throw reason instanceof CdxError
                ? reason
                : new CdxError(`Could not reach the Wayback Machine CDX API: ${(reason as Error)?.message ?? 'unknown error'}`);
        }
        return collapseToDaily(fulfilled.flatMap((r) => r.value));
    } finally {
        clearTimeout(timer);
    }
}

const FULL_TIMESTAMP_RE = /^\d{14}$/;

export function formatTimestamp(timestamp: string): string {
    if (!FULL_TIMESTAMP_RE.test(timestamp)) return timestamp;

    const y = timestamp.slice(0, 4);
    const m = timestamp.slice(4, 6);
    const d = timestamp.slice(6, 8);
    const hh = timestamp.slice(8, 10) || '00';
    const mm = timestamp.slice(10, 12) || '00';
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}
