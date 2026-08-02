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

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * matchType: 'exact' against a bare domain (no scheme, no www, no trailing
 * slash) only matches captures recorded in that exact form — which misses
 * almost everything, since most crawls record "https://www.example.com/" or
 * similar. 'domain' matches the host broadly (any scheme, www or not, any
 * path), and the `original` regex filter narrows that back down to just the
 * homepage — any scheme/www/trailing-slash variant of it — server-side, so
 * we're not paying to fetch every subpage just to discard it client-side.
 */
export function buildCdxParams(domain: string): URLSearchParams {
    const rootPattern = `^https?://(www\\.)?${escapeRegex(domain)}/?$`;
    const params = new URLSearchParams({
        url: domain,
        matchType: 'domain',
        output: 'json',
        fl: 'timestamp,statuscode',
        limit: '2000',
    });
    params.append('filter', 'statuscode:200');
    params.append('filter', `original:${rootPattern}`);
    return params;
}

/**
 * Collapses to one capture per calendar day and sorts newest-first
 * ourselves, rather than trusting the CDX API's `collapse` param + row
 * order: with matchType=domain, results can be grouped by URL variant
 * (www vs non-www) rather than merged into one chronological timeline, so
 * relying on API-side collapsing/ordering across variants isn't reliable.
 */
export function parseCdxJson(data: unknown): Snapshot[] {
    if (!Array.isArray(data) || data.length < 2) return [];
    const [, ...rows] = data as [string[], ...unknown[][]];
    const snapshots = rows
        .map((row) => ({ timestamp: String(row[0] ?? ''), statuscode: String(row[1] ?? '') }))
        .filter((s) => s.timestamp);

    const byDay = new Map<string, Snapshot>();
    for (const snapshot of snapshots) {
        const day = snapshot.timestamp.slice(0, 8);
        if (!byDay.has(day)) byDay.set(day, snapshot);
    }
    return [...byDay.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export async function fetchSnapshots(domain: string, timeoutMs = 15000): Promise<Snapshot[]> {
    if (!domain.trim()) throw new CdxError('Please provide a domain to look up.');

    const url = `${CDX_API_URL}?${buildCdxParams(domain).toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } catch (err) {
        throw new CdxError(`Could not reach the Wayback Machine CDX API: ${(err as Error).message}`);
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) throw new CdxError(`The CDX API returned HTTP ${response.status}.`);

    let data: unknown;
    try {
        data = await response.json();
    } catch {
        throw new CdxError('The CDX API returned an unexpected response.');
    }

    return parseCdxJson(data);
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
