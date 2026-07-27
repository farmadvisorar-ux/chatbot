import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { insertCandidates, type DirectoryCandidate } from '../_lib/directory.js';
import { sendAdminDigest, sendOutreachDigest, type DigestEntry } from '../_lib/email.js';

const DIGEST_BATCH_SIZE = 10;
const CONTACT_BATCH_SIZE = 15;

// Shared inboxes belong to a business rather than identifying a person, so
// they're the ones worth surfacing for outreach. Anything else is recorded as
// 'personal' and flagged in the UI.
const ROLE_MAILBOXES = /^(hello|hi|contact|support|info|team|sales|press|admin|help|founders?|care|enquiries|inquiries)@/i;
const SKIP_ADDRESS = /(example|sentry|wixpress|godaddy|squarespace|\.png|\.jpg|\.svg|@2x|u003e)/i;

/**
 * Reads the contact address a product publishes on its own site.
 *
 * Only the page the listing already points at is fetched — no crawling, no
 * third-party lookup services, and nothing pulled from commit histories or
 * profiles. Sites that disallow us in robots.txt are skipped. This is the
 * address the company put up to be contacted on; it's for writing to people
 * individually, not for loading into a bulk sender.
 */
async function findContactEmail(pageUrl: string): Promise<{ email: string; kind: string } | null> {
    let origin: string;
    try {
        origin = new URL(pageUrl).origin;
    } catch {
        return null;
    }

    try {
        const robots = await fetchText(`${origin}/robots.txt`).catch(() => '');
        // Only honour a blanket disallow-all; per-path rules aren't worth
        // parsing for a single homepage fetch.
        if (/user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(robots)) return null;
    } catch {
        /* No robots.txt is not a prohibition. */
    }

    const html = await fetchText(pageUrl).catch(() => '');
    if (!html) return null;

    const found = new Set<string>();
    for (const match of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
        const address = decodeEntities(match[1]).trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(address) && !SKIP_ADDRESS.test(address)) found.add(address);
    }

    if (!found.size) return null;
    const addresses = [...found];
    const role = addresses.find(address => ROLE_MAILBOXES.test(address));
    return role
        ? { email: role, kind: 'role' }
        : { email: addresses[0], kind: 'personal' };
}

/** Looks up contact addresses for entries that haven't been checked yet. */
async function runContactLookup(pool: ReturnType<typeof getPool>): Promise<{ checked: number; found: number }> {
    const { rows } = await pool.query<{ id: string; url: string }>(
        `SELECT id, url FROM directory_entries
         WHERE status = 'live' AND contact_checked_at IS NULL
         ORDER BY featured DESC, discovered_at DESC
         LIMIT $1`,
        [CONTACT_BATCH_SIZE],
    );

    let found = 0;
    for (const row of rows) {
        const contact = await findContactEmail(row.url).catch(() => null);
        await pool.query(
            'UPDATE directory_entries SET contact_email = $2, contact_kind = $3, contact_checked_at = now() WHERE id = $1',
            [row.id, contact?.email ?? null, contact?.kind ?? null],
        );
        if (contact) found += 1;
    }
    return { checked: rows.length, found };
}

/**
 * Emails the owner a batch of launches they haven't seen yet, with links for
 * personal outreach, then marks them so the next batch moves on.
 *
 * Rows are claimed and marked in one statement so two overlapping runs cannot
 * send the same batch twice.
 */
async function runOutreachDigest(pool: ReturnType<typeof getPool>): Promise<{ sent: number }> {
    const { rows } = await pool.query<DigestEntry & { id: string }>(
        `UPDATE directory_entries SET digested_at = now()
         WHERE id IN (
           SELECT id FROM directory_entries
           WHERE status = 'live' AND digested_at IS NULL
           ORDER BY discovered_at DESC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, name, tagline, url, source, source_url AS "sourceUrl",
                   contact_email AS "contactEmail", contact_kind AS "contactKind"`,
        [DIGEST_BATCH_SIZE],
    );
    if (!rows.length) return { sent: 0 };

    const delivered = await sendOutreachDigest(rows);
    if (!delivered) {
        // Put them back in the queue so a mail failure doesn't silently skip
        // a batch the owner never actually received.
        await pool.query(
            `UPDATE directory_entries SET digested_at = NULL WHERE id = ANY($1::uuid[])`,
            [rows.map(row => row.id)],
        );
        return { sent: 0 };
    }
    return { sent: rows.length };
}

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

/** Dev.to's #showdev tag is where makers post what they've built. Official API. */
async function fromDevTo(): Promise<DirectoryCandidate[]> {
    const body = await fetchText('https://dev.to/api/articles?tag=showdev&per_page=60');
    const data = JSON.parse(body) as Array<{ title: string; description?: string; url: string; tag_list?: string[]; positive_reactions_count?: number }>;

    return data
        .filter(post => post.title && (post.description ?? '').length >= 8)
        .map(post => {
            const title = post.title.replace(/^(show\s*dev|showdev)\s*:?\s*/i, '').trim();
            const [namePart, ...rest] = title.split(/\s+[–—-]\s+/);
            const tagline = (rest.join(' - ') || post.description || title).slice(0, 200);
            return {
                name: (namePart || title).slice(0, 80),
                tagline,
                description: `${tagline}. Shared by its maker on DEV's #showdev.`,
                url: post.url,
                category: categorise(`${title} ${(post.tag_list ?? []).join(' ')}`),
                tags: [categorise(title), 'showdev', 'New launch'],
                source: 'DEV',
                sourceUrl: post.url,
                score: post.positive_reactions_count ?? 0,
            };
        });
}

/** Lobsters' "show" tag — a curated developer community, low volume but high signal. */
async function fromLobsters(): Promise<DirectoryCandidate[]> {
    const xml = await fetchText('https://lobste.rs/t/show.rss');
    const candidates: DirectoryCandidate[] = [];

    for (const chunk of xml.split('<item>').slice(1)) {
        const item = chunk.split('</item>')[0];
        const rawTitle = item.match(/<title>([\s\S]*?)<\/title>/)?.[1];
        const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim();
        const comments = item.match(/<comments>([\s\S]*?)<\/comments>/)?.[1]?.trim();
        if (!rawTitle || !link) continue;

        const title = stripTags(rawTitle).replace(/^show\s+lobsters:?\s*/i, '').trim();
        const [namePart, ...rest] = title.split(/\s+[–—-]\s+/);
        const tagline = (rest.join(' - ') || title).slice(0, 200);
        if (tagline.length < 8) continue;

        candidates.push({
            name: (namePart || title).slice(0, 80),
            tagline,
            description: `${tagline}. Shared by its maker on Lobsters.`,
            url: link,
            category: categorise(title),
            tags: [categorise(title), 'Show Lobsters', 'New launch'],
            source: 'Lobsters',
            sourceUrl: comments || link,
            score: 0,
        });
    }
    return candidates;
}

const SOURCES: Array<[string, () => Promise<DirectoryCandidate[]>]> = [
    ['Hacker News', fromHackerNews],
    ['Product Hunt', fromProductHunt],
    ['GitHub', fromGitHub],
    ['DEV', fromDevTo],
    ['Lobsters', fromLobsters],
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

    // Two schedules share this function because Vercel's Hobby plan caps the
    // project at 12 serverless functions: hourly ingest, two-hourly digest.
    const task = typeof req.query.task === 'string' ? req.query.task : 'ingest';
    if (task === 'digest') {
        const { sent } = await runOutreachDigest(pool);
        json(res, 200, { ok: true, task: 'digest', sent });
        return;
    }
    if (task === 'contacts') {
        const result = await runContactLookup(pool);
        json(res, 200, { ok: true, task: 'contacts', ...result });
        return;
    }

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

    // Only surface ingest failures here. What was *added* arrives in the
    // two-hourly outreach digest instead, so a busy hour doesn't produce two
    // emails about the same launches.
    const failures = Object.entries(report)
        .filter(([, result]) => 'failed' in result)
        .map(([name, result]) => `${name}: ${(result as { failed: string }).failed}`);
    if (failures.length) {
        await sendAdminDigest(`Some launch sources failed during ingest:\n\n${failures.join('\n')}`);
    }

    json(res, 200, { ok: true, totalAdded, sources: report });
}
