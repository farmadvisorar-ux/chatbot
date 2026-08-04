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
        // One capture per month, server-side. Without this, a heavily
        // archived domain burns the whole row budget on a narrow slice of
        // its history: walmart.com with a plain limit returned only
        // 1996-2006 (oldest-first truncation), and flipping to a negative
        // limit swung it to only the last ~5 months. Collapsing monthly
        // first means the budget spans the domain's entire archived
        // lifetime, which is the point of a snapshot picker — someone
        // restoring an expired domain usually wants a capture from before
        // it went dark, which may be years back.
        collapse: 'timestamp:6',
        // Negative = most recent N. CDX returns oldest-first, so this keeps
        // the newest months if a domain somehow exceeds the budget.
        limit: '-600',
    });
}

export function parseCdxJson(data: unknown): Snapshot[] {
    if (!Array.isArray(data) || data.length < 2) return [];
    const [, ...rows] = data as [string[], ...unknown[][]];
    return rows
        .map((row) => ({ timestamp: String(row[0] ?? ''), statuscode: String(row[1] ?? '') }))
        .filter((s) => s.timestamp);
}

/**
 * Collapses to one capture per calendar month and sorts newest-first.
 * Matches the server-side monthly collapse; this pass exists to merge the
 * two host variants (bare + www) into a single timeline rather than
 * showing near-duplicate entries for the same month.
 */
export function collapseToMonthly(snapshots: Snapshot[]): Snapshot[] {
    const byMonth = new Map<string, Snapshot>();
    for (const snapshot of snapshots) {
        const month = snapshot.timestamp.slice(0, 6);
        const existing = byMonth.get(month);
        // Keep the newest capture within each month for a stable pick.
        if (!existing || snapshot.timestamp > existing.timestamp) byMonth.set(month, snapshot);
    }
    return [...byMonth.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/**
 * Query bounded to a span of years. `from`/`to` limit the index range the
 * CDX server has to touch, which is what makes this complete on domains
 * where the unbounded query times out — the collapse still happens, but
 * over a few years' captures instead of thirty.
 */
function buildWindowParams(url: string, fromYear: number, toYear: number): URLSearchParams {
    const months = (toYear - fromYear + 1) * 12;
    return new URLSearchParams({
        url,
        matchType: 'exact',
        output: 'json',
        fl: 'timestamp,statuscode',
        filter: 'statuscode:200',
        from: String(fromYear),
        to: String(toYear),
        collapse: 'timestamp:6',
        limit: String(-months),
    });
}

/**
 * Last-resort query. Skipping `collapse` entirely lets the server seek
 * straight to the tail of the index, so it returns even when everything
 * else has timed out — but on a domain crawled hundreds of times a day,
 * 400 captures can span only a couple of days.
 */
function buildRecentOnlyParams(url: string): URLSearchParams {
    return new URLSearchParams({
        url,
        matchType: 'exact',
        output: 'json',
        fl: 'timestamp,statuscode',
        filter: 'statuscode:200',
        limit: '-400',
    });
}

/** The Wayback Machine's own coverage starts here; querying earlier years is wasted requests. */
const ARCHIVE_FIRST_YEAR = 1996;

/** Runs tasks with bounded concurrency so a 30-year sweep doesn't fire 30 simultaneous requests at archive.org. */
export async function pooled<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= tasks.length) return;
            try {
                results[i] = { status: 'fulfilled', value: await tasks[i]() };
            } catch (reason) {
                results[i] = { status: 'rejected', reason };
            }
        }
    });
    await Promise.all(workers);
    return results;
}

/**
 * Walks the archive year by year. Slower in wall-clock terms than one big
 * query, but each request is bounded and therefore actually completes —
 * which is the difference between a full timeline and nothing at all on
 * domains like amazon.com.
 */
/** Years per bounded query. Six windows cover 1996-today. */
const WINDOW_YEARS = 5;

async function fetchByWindowSweep(
    variant: string,
    perRequestTimeoutMs: number,
): Promise<{
    snapshots: Snapshot[];
    windowsQueried: number;
    windowsSucceeded: number;
    newestWindowSucceeded: boolean;
}> {
    const currentYear = new Date().getUTCFullYear();
    const windows: [number, number][] = [];
    for (let end = currentYear; end >= ARCHIVE_FIRST_YEAR; end -= WINDOW_YEARS) {
        windows.push([Math.max(ARCHIVE_FIRST_YEAR, end - WINDOW_YEARS + 1), end]);
    }

    // Five-year windows, concurrency 2: ~6 requests per sweep instead of the
    // ~30 a per-year sweep cost. That burst was enough to get archive.org to
    // start refusing us outright ("fetch failed" in under a second), which
    // then broke the *next* domain lookup too. The archive is a free, shared
    // service — a bounded query is the thing that makes this complete, and
    // there's no need to slice it finer than necessary to achieve that.
    const results = await pooled(
        windows.map(([from, to]) => () =>
            fetchOneWithRetry(buildWindowParams(variant, from, to), perRequestTimeoutMs, 2),
        ),
        2,
    );
    const ok = results.filter((r): r is PromiseFulfilledResult<Snapshot[]> => r.status === 'fulfilled');
    return {
        snapshots: ok.flatMap((r) => r.value),
        windowsQueried: windows.length,
        windowsSucceeded: ok.length,
        // windows[0] is the newest span. Tracked separately because losing it
        // is not equivalent to losing an old one: amazon.com came back
        // "complete" with 216 snapshots ending in 2021, since 6-of-7 windows
        // cleared the ratio bar while the one covering 2022-today had
        // silently failed. For restoring a domain the recent end is the
        // point, so its absence has to count for more than a ratio.
        newestWindowSucceeded: results[0]?.status === 'fulfilled',
    };
}

async function fetchOne(params: URLSearchParams, timeoutMs: number): Promise<Snapshot[]> {
    // Each request gets its own budget. A single shared AbortController meant
    // one slow variant killed the other mid-flight, turning a partial success
    // into a total failure.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const apiUrl = `${CDX_API_URL}?${params.toString()}`;
        const response = await fetch(apiUrl, { signal: controller.signal, headers: { Accept: 'application/json' } });
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
    } finally {
        clearTimeout(timer);
    }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Retries transport-level failures with backoff. An aborted request means we
 * ran out of time and retrying would just burn more of it, but a refused
 * connection ("fetch failed") is usually archive.org shedding load and often
 * succeeds a moment later — the difference between a transient blip and a
 * hard error shown to the user.
 */
async function fetchOneWithRetry(params: URLSearchParams, timeoutMs: number, attempts = 3): Promise<Snapshot[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
        try {
            return await fetchOne(params, timeoutMs);
        } catch (err) {
            lastError = err;
            const aborted = (err as Error)?.name === 'AbortError' || /abort/i.test(String((err as Error)?.message));
            if (aborted) throw err;
        }
    }
    throw lastError;
}

/** Runs both host variants, tolerating one failing without sinking the other. */
async function runVariants(
    variants: string[],
    build: (url: string) => URLSearchParams,
    timeoutMs: number,
): Promise<{ snapshots: Snapshot[]; lastError: unknown }> {
    const results = await Promise.allSettled(variants.map((v) => fetchOneWithRetry(build(v), timeoutMs)));
    const snapshots = results
        .filter((r): r is PromiseFulfilledResult<Snapshot[]> => r.status === 'fulfilled')
        .flatMap((r) => r.value);
    const lastError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    return { snapshots, lastError: lastError?.reason };
}

export interface SnapshotResult {
    snapshots: Snapshot[];
    /** False when only the cheap recent-only fallback succeeded, so the list isn't the domain's full history. */
    complete: boolean;
}

/**
 * Short-lived cache of successful lookups. Serverless instances are
 * ephemeral so this is opportunistic, not a real cache tier — but a domain's
 * archive history barely changes minute to minute, and users retry (both by
 * hand and because a partial result invites it). Every hit here is a burst of
 * requests archive.org doesn't receive, which is what keeps us from getting
 * rate-limited in the first place.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; result: SnapshotResult }>();

export async function fetchSnapshots(domain: string, timeoutMs = 18000): Promise<SnapshotResult> {
    const trimmed = domain.trim();
    if (!trimmed) throw new CdxError('Please provide a domain to look up.');

    const bare = trimmed.replace(/^www\./i, '');
    const variants = [bare, `www.${bare}`];

    const cached = cache.get(bare);
    // Only serve complete results from cache: a partial one should get
    // another shot at the archive rather than being pinned for 10 minutes.
    if (cached && cached.result.complete && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.result;
    }

    const finish = (snapshots: Snapshot[], complete: boolean): SnapshotResult => {
        const result = { snapshots: collapseToMonthly(snapshots), complete };
        cache.set(bare, { at: Date.now(), result });
        return result;
    };

    // Tier 1: one unbounded full-history query. Fast for the overwhelming
    // majority of domains (walmart.com returns in ~5s), and a single round
    // trip, so it's worth trying first.
    const full = await runVariants(variants, buildCdxParams, timeoutMs);
    if (full.snapshots.length) return finish(full.snapshots, true);

    // Tier 2: sweep in bounded windows. Only reached for domains archived so
    // heavily that the unbounded query can't finish (amazon.com, ebay.com).
    // More requests, but each is bounded and completes — and it still yields
    // the domain's full timeline, so this is not inherently degraded.
    for (const variant of variants) {
        const swept = await fetchByWindowSweep(variant, 12000);
        if (swept.snapshots.length) {
            // Individual windows can still get shed under load. Only claim a
            // complete history if most of them came back AND the newest one
            // did — a list that stops years short is misleading no matter how
            // many older windows succeeded.
            const coverage = swept.windowsSucceeded / swept.windowsQueried;
            return finish(swept.snapshots, coverage >= 0.8 && swept.newestWindowSucceeded);
        }
    }

    // Tier 3: recent captures only. A short list still beats the hard
    // "could not reach the Wayback Machine" error, and recent captures are
    // usually what someone restoring a domain wants anyway.
    const recent = await runVariants(variants, buildRecentOnlyParams, Math.min(timeoutMs, 10000));
    if (recent.snapshots.length) return finish(recent.snapshots, false);

    // Genuinely nothing: either the domain has no captures, or the archive is
    // unreachable. Surface the underlying reason rather than a generic message.
    const reason = full.lastError ?? recent.lastError;
    if (!reason) return { snapshots: [], complete: true };
    throw reason instanceof CdxError
        ? reason
        : new CdxError(`Could not reach the Wayback Machine CDX API: ${(reason as Error)?.message ?? 'unknown error'}`);
}
