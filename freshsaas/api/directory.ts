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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;

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
