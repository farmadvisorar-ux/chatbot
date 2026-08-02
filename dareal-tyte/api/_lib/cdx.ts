/**
 * Server-side client for the Wayback Machine CDX Server API.
 *
 * This started as a browser-side module (see git history), following the
 * same reasoning wayback-downloader/ in this repo uses for its own Wayback
 * fetches: avoid server-side requests since archive.org has been observed
 * silently dropping/resetting them from datacenter IPs. In practice here it
 * failed differently: browsers (confirmed in real-world testing, not just
 * this sandbox) got "Load failed" from a direct cross-origin fetch to this
 * endpoint, while api/_lib/archive.ts's server-side fetches to
 * web.archive.org from this same Vercel project have worked reliably in
 * production (/api/recover and /api/launch both succeeded end-to-end,
 * including with a large site). Moved server-side on that evidence.
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
 * plus a regex filter was tried first, but for a site the size of
 * walmart.com that forces the CDX server to scan the site's entire page
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
