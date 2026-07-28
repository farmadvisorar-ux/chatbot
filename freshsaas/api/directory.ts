import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { json, requireMethod } from './_lib/http.js';

const ACCENTS = ['#c9ff57', '#7ac7ff', '#ff7d66', '#ffd36a', '#90e0c1', '#c9b7ff', '#ffb7a7', '#bde58d'];

const initialsOf = (name: string): string =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '??';

/** Relative age, matching how the static catalog labels its entries. */
function launchedLabel(discoveredAt: string): string {
    const hours = (Date.now() - new Date(discoveredAt).getTime()) / 36e5;
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(discoveredAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

const EVENT_TYPES = new Set(['pageview', 'listing_click', 'search', 'outbound', 'signup_open', 'submit_open', 'marketplace_view']);

/**
 * Records one analytics event. Lives on this endpoint rather than its own
 * because the project sits at Vercel's 12-function Hobby cap; this is already
 * the public, unauthenticated data route for the directory.
 *
 * Stores no IP address and sets no cookie — country comes from Vercel's edge
 * header and the session id is a random per-tab value from the client.
 */
async function recordEvent(req: VercelRequest, res: VercelResponse): Promise<void> {
    const body = (req.body || {}) as Record<string, unknown>;
    const type = String(body.type ?? '');
    if (!EVENT_TYPES.has(type)) {
        json(res, 400, { error: 'Unknown event type' });
        return;
    }

    const str = (value: unknown, max: number): string | null =>
        typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

    let referrerHost: string | null = null;
    const referrer = str(body.referrer, 500);
    if (referrer) {
        try { referrerHost = new URL(referrer).hostname.replace(/^www\./, ''); } catch { referrerHost = null; }
    }

    const userAgent = String(req.headers['user-agent'] ?? '');
    const device = /mobile|iphone|android/i.test(userAgent) ? 'mobile'
        : /ipad|tablet/i.test(userAgent) ? 'tablet' : 'desktop';

    const entryId = str(body.entryId, 64);
    await getPool().query(
        `INSERT INTO analytics_events (type, path, referrer_host, country, device, session_id, entry_id, label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            type,
            str(body.path, 300) ?? '/',
            referrerHost,
            str(req.headers['x-vercel-ip-country'], 4),
            device,
            str(body.sessionId, 64),
            entryId && /^[0-9a-f-]{36}$/i.test(entryId) ? entryId : null,
            str(body.label, 200),
        ],
    );
    json(res, 202, { ok: true });
}

/**
 * Published Insights articles.
 *
 * Also served from this endpoint for the 12-function reason above. Each link
 * resolves to its affiliate URL when the operator has set one; `sponsored`
 * tells the client to mark the link up correctly and show the disclosure.
 */
async function sendInsights(req: VercelRequest, res: VercelResponse): Promise<void> {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
    const { rows } = slug
        ? await getPool().query(
            `SELECT slug, title, keyword, meta_description, category, excerpt, body_html, links,
                    read_minutes, updated_at
             FROM insight_articles WHERE published AND slug = $1`, [slug])
        : await getPool().query(
            `SELECT slug, title, keyword, meta_description, category, excerpt, body_html, links,
                    read_minutes, updated_at
             FROM insight_articles WHERE published ORDER BY rank ASC, created_at ASC`);

    json(res, 200, {
        articles: rows.map(row => ({
            slug: row.slug,
            title: row.title,
            keyword: row.keyword,
            metaDescription: row.meta_description,
            category: row.category,
            excerpt: row.excerpt,
            bodyHtml: row.body_html,
            readMinutes: row.read_minutes,
            updatedAt: row.updated_at,
            links: (row.links || []).map((link: { name: string; url: string; note?: string; affiliateUrl?: string | null }) => ({
                name: link.name,
                note: link.note ?? '',
                url: link.affiliateUrl || link.url,
                sponsored: Boolean(link.affiliateUrl),
            })),
        })),
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method === 'POST') {
        await recordEvent(req, res);
        return;
    }
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    if (req.query.view === 'insights') {
        await sendInsights(req, res);
        return;
    }

    const { rows } = await getPool().query(
        `SELECT id, name, tagline, description, url, category, tags, source, source_url,
                discovered_at, featured, featured_rank
         FROM directory_entries WHERE status = 'live'
         ORDER BY featured DESC, featured_rank ASC, discovered_at DESC LIMIT 500`,
    );

    // Shaped to match the frontend Product type so it merges with the static
    // catalog without any per-source special casing in the UI.
    const launches = rows.map((row, index) => {
        const ageHours = (Date.now() - new Date(row.discovered_at).getTime()) / 36e5;
        return {
            id: `db-${row.id}`,
            name: row.name,
            initials: initialsOf(row.name),
            category: row.category,
            tagline: row.tagline,
            description: row.description,
            audience: `${row.category} teams, founders and early adopters`,
            pricing: 'See launch page',
            launched: launchedLabel(row.discovered_at),
            featured: Boolean(row.featured),
            // Featured entries sit above the freshness sort so a hand-picked
            // launch stays at the top rather than sinking as it ages.
            freshness: row.featured ? 200 - row.featured_rank : Math.max(1, Math.round(100 - Math.min(99, ageHours / 2))),
            accent: ACCENTS[index % ACCENTS.length],
            tags: Array.isArray(row.tags) && row.tags.length ? row.tags : [row.category],
            url: row.url,
            source: row.source,
            sourceUrl: row.source_url ?? undefined,
        };
    });

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    json(res, 200, { launches });
}
