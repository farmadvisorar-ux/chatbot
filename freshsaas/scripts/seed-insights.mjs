/**
 * Upserts the Insights articles into the database.
 *
 * Article copy is owned by the repo, so re-running this refreshes the text.
 * Affiliate URLs are owned by the admin panel, so they are merged back in by
 * link name rather than overwritten — otherwise every content edit would wipe
 * the monetisation the operator has set up.
 */
import { neon } from '@neondatabase/serverless';
import { articles } from './insights-content.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
}

const sql = neon(url);

const existing = await sql`SELECT slug, links FROM insight_articles`;
const affiliatesBySlug = new Map(
    existing.map(row => [
        row.slug,
        new Map((row.links || []).filter(l => l.affiliateUrl).map(l => [l.name, l.affiliateUrl])),
    ]),
);

let inserted = 0;
let updated = 0;
let preserved = 0;

for (const article of articles) {
    const keep = affiliatesBySlug.get(article.slug);
    const links = article.links.map(link => {
        const affiliateUrl = keep?.get(link.name) ?? null;
        if (affiliateUrl) preserved += 1;
        return { name: link.name, url: link.url, note: link.note ?? '', affiliateUrl };
    });

    const result = await sql`
        INSERT INTO insight_articles
            (slug, title, keyword, meta_description, category, excerpt, body_html, links, read_minutes, rank, published)
        VALUES (
            ${article.slug}, ${article.title}, ${article.keyword}, ${article.metaDescription},
            ${article.category}, ${article.excerpt}, ${article.body}, ${JSON.stringify(links)}::jsonb,
            ${article.readMinutes}, ${article.rank ?? 100}, true
        )
        ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            keyword = EXCLUDED.keyword,
            meta_description = EXCLUDED.meta_description,
            category = EXCLUDED.category,
            excerpt = EXCLUDED.excerpt,
            body_html = EXCLUDED.body_html,
            links = EXCLUDED.links,
            read_minutes = EXCLUDED.read_minutes,
            updated_at = now()
        RETURNING (xmax = 0) AS is_insert`;

    if (result[0]?.is_insert) inserted += 1;
    else updated += 1;
}

console.log(`Insights seeded: ${inserted} inserted, ${updated} updated, ${preserved} affiliate link(s) preserved.`);
