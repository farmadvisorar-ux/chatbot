/**
 * Fetches a raw historical snapshot from the Wayback Machine.
 *
 * IMPORTANT: this repo's own wayback-downloader/README.md documents that
 * requests to web.archive.org from serverless/datacenter IP ranges
 * (Vercel's included) were observed being silently dropped or reset by
 * archive.org's anti-bot protection — a User-Agent header and retries did
 * not fix it there. This module makes the same class of request from a
 * server context, so it carries the same risk. See that README and this
 * project's own README before relying on these routes in production.
 */

export class ArchiveFetchError extends Error {}

async function fetchOnce(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 DAREALTYTE-Engine/1.0',
                Accept: 'text/html,application/xhtml+xml',
            },
        });
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchSnapshotHtml(archiveUrl: string, timeoutMs = 15000): Promise<string> {
    const perAttemptTimeout = Math.max(5000, Math.floor(timeoutMs / 2));

    let response: Response;
    try {
        response = await fetchOnce(archiveUrl, perAttemptTimeout);
    } catch {
        try {
            response = await fetchOnce(archiveUrl, perAttemptTimeout);
        } catch (err) {
            throw new ArchiveFetchError(`Could not reach the Wayback Machine: ${(err as Error).message}`);
        }
    }

    if (response.status === 404) {
        throw new ArchiveFetchError('No historical snapshot found for that domain/timestamp.');
    }
    if (!response.ok) {
        throw new ArchiveFetchError(`The Wayback Machine returned HTTP ${response.status}.`);
    }

    const html = await response.text();
    if (!html) {
        throw new ArchiveFetchError('The Wayback Machine returned an empty snapshot.');
    }
    return html;
}
