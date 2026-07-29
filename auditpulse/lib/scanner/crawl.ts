import { safeFetch } from './net.js';

const LINK_RE = /<a\s[^>]*href\s*=\s*["']([^"'#][^"']*)["']/gi;
const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip|mp4|mp3|woff2?|ttf|xml|json)$/i;

/**
 * Crawls a handful of same-origin pages linked from the homepage, so checks
 * that benefit from seeing more of the site (mixed content, exposed JS
 * secrets, missing subresource integrity) aren't limited to just the
 * homepage. Deliberately shallow — homepage links only, not a real spider —
 * to keep the whole audit fast and within a single serverless invocation.
 */
export async function discoverPages(baseUrl: string, homepageHtml: string, maxPages = 5): Promise<string[]> {
    const base = new URL(baseUrl);
    const pages = new Set<string>([baseUrl]);

    for (const match of homepageHtml.matchAll(LINK_RE)) {
        if (pages.size >= maxPages) break;
        let url: URL;
        try {
            url = new URL(match[1], baseUrl);
        } catch {
            continue;
        }
        if (url.hostname !== base.hostname) continue;
        if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
        if (SKIP_EXTENSIONS.test(url.pathname)) continue;
        url.hash = '';
        pages.add(url.toString());
    }

    return Array.from(pages).slice(0, maxPages);
}

/** Best-effort homepage fetch for crawling purposes — callers treat a failure as "no extra pages found," not a scan failure. */
export async function fetchHomepageHtml(targetUrl: string, timeoutMs: number): Promise<string> {
    try {
        const res = await safeFetch(targetUrl, { timeoutMs });
        return await res.text();
    } catch {
        return '';
    }
}
