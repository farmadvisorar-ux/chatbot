import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { insertCandidates, type DirectoryCandidate } from '../_lib/directory.js';

const USER_AGENT = 'FreshSAAS-Bot/1.0 (+https://freshsaas.online)';
const FETCH_TIMEOUT_MS = 12000;

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, ...headers },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${url} returned ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

const decodeEntities = (value: string): string =>
    value
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const stripTags = (value: string): string => decodeEntities(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Very small tag-based categoriser — good enough to give entries a useful facet. */
function categorise(text: string): string {
    const haystack = text.toLowerCase();
    const rules: Array<[RegExp, string]> = [
        [/\b(ai|llm|gpt|agent|model)\b/, 'AI'],
        [/\b(dev|api|sdk|cli|open.?source|library|framework)\b/, 'Developer Tools'],
        [/\b(design|ui|ux|figma)\b/, 'Design'],
        [/\b(market|seo|ads|campaign|growth)\b/, 'Marketing'],
        [/\b(sales|crm|lead|outreach)\b/, 'Sales'],
        [/\b(finance|invoice|billing|payment|accounting)\b/, 'Finance'],
        [/\b(analytic|dashboard|metric|data)\b/, 'Analytics'],
        [/\b(productivity|task|note|calendar|workflow)\b/, 'Productivity'],
        [/\b(security|auth|privacy|encrypt)\b/, 'Security'],
    ];
    for (const [pattern, label] of rules) if (pattern.test(haystack)) return label;
    return 'New launch';
}

/** Show HN submissions — Hacker News' own launch channel, via the public Algolia API. */
async function fromHackerNews(): Promise<DirectoryCandidate[]> {
    const body = await fetchText('https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=100');
    const data = JSON.parse(body) as { hits?: Array<{ objectID: string; title?: string; url?: string; points?: number; story_text?: string }> };
    const candidates: DirectoryCandidate[] = [];

    for (const hit of data.hits ?? []) {
        if (!hit.url || !hit.title) continue;
        const title = hit.title.replace(/^show hn:?\s*/i, '').trim();
        // Titles often read "Name – what it does"; split so the name stays short.
        const [namePart, ...rest] = title.split(/\s+[–—-]\s+/);
        const name = (namePart || title).slice(0, 80);
        const tagline = (rest.join(' - ') || title).slice(0, 200);
        if (tagline.length < 8) continue;

        candidates.push({
            name,
            tagline,
            description: `${tagline}. Shared by its maker on Hacker News' Show HN.`,
            url: hit.url,
            category: categorise(title),
            tags: [categorise(title), 'Show HN', 'New launch'],
            source: 'Hacker News',
            sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
            score: hit.points ?? 0,
        });
    }
    return candidates;
}

/** Product Hunt's official Atom feed — published for syndication. */
async function fromProductHunt(): Promise<DirectoryCandidate[]> {
    const xml = await fetchText('https://www.producthunt.com/feed');
    const candidates: DirectoryCandidate[] = [];

    for (const chunk of xml.split('<entry>').slice(1)) {
        const entry = chunk.split('</entry>')[0];
        const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
        const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1];
        const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? '';
        if (!title || !link) continue;

        // First paragraph of the content block is the product's own one-liner.
        const firstParagraph = decodeEntities(content).match(/<p>([\s\S]*?)<\/p>/)?.[1];
        const tagline = stripTags(firstParagraph ?? '').slice(0, 200);
        if (tagline.length < 8) continue;

        const name = stripTags(title).slice(0, 80);
        candidates.push({
            name,
            tagline,
            description: `${tagline}. Featured on Product Hunt.`,
            url: link,
            category: categorise(`${name} ${tagline}`),
            tags: [categorise(`${name} ${tagline}`), 'Product Hunt', 'New launch'],
            source: 'Product Hunt',
            sourceUrl: link,
            score: 0,
        });
    }
    return candidates;
}

/**
 * Newly created GitHub repositories with early traction — a good proxy for
 * open-source product launches. Uses an authenticated token when GITHUB_TOKEN
 * is set (higher rate limit); works unauthenticated at a lower limit too.
 */
async function fromGitHub(): Promise<DirectoryCandidate[]> {
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const query = encodeURIComponent(`created:>${since} stars:>15`);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const body = await fetchText(
        `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=50`,
        headers,
    );
    const data = JSON.parse(body) as { items?: Array<{ name: string; description?: string; homepage?: string; html_url: string; stargazers_count: number; topics?: string[] }> };

    return (data.items ?? [])
        .filter(repo => repo.description && repo.description.length >= 8)
        .map(repo => ({
            name: repo.name.replace(/[-_]/g, ' ').slice(0, 80),
            tagline: repo.description!.slice(0, 200),
            description: `${repo.description}. Open-source project gaining early traction on GitHub.`,
            url: repo.homepage && /^https?:\/\//.test(repo.homepage) ? repo.homepage : repo.html_url,
            category: categorise(`${repo.name} ${repo.description} ${(repo.topics ?? []).join(' ')}`),
            tags: [categorise(`${repo.name} ${repo.description}`), 'Open source', 'GitHub'],
            source: 'GitHub',
            sourceUrl: repo.html_url,
            score: repo.stargazers_count,
        }));
}

const SOURCES: Array<[string, () => Promise<DirectoryCandidate[]>]> = [
    ['Hacker News', fromHackerNews],
    ['Product Hunt', fromProductHunt],
    ['GitHub', fromGitHub],
];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST', 'GET'])) return;

    const secret = process.env.CRON_SECRET;
    if (!secret) {
        error(res, 501, 'Ingest is not configured');
        return;
    }
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (provided !== secret) {
        error(res, 401, 'Unauthorized');
        return;
    }

    const pool = getPool();
    const report: Record<string, { found: number; added: number } | { failed: string }> = {};
    let totalAdded = 0;

    // Each source is isolated: a source being down or changing shape must not
    // stop the others from ingesting.
    for (const [name, load] of SOURCES) {
        try {
            const candidates = await load();
            const added = await insertCandidates(pool, candidates);
            report[name] = { found: candidates.length, added };
            totalAdded += added;
        } catch (err) {
            report[name] = { failed: err instanceof Error ? err.message : String(err) };
        }
    }

    json(res, 200, { ok: true, totalAdded, sources: report });
}
