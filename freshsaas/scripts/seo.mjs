/**
 * Post-build SEO step.
 *
 * The directory is fetched client-side, so the HTML a crawler receives would
 * otherwise contain an empty grid — hundreds of launches invisible to search.
 * This bakes the current listings into dist/index.html as real markup plus an
 * ItemList in JSON-LD, and emits sitemap.xml and robots.txt.
 *
 * Runs against the live database at build time. If DATABASE_URL isn't present
 * (a local build, say) it degrades to a sitemap of the static pages rather
 * than failing the build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SITE = process.env.PUBLIC_SITE_URL || 'https://freshsaas.online';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

async function loadListings() {
    if (!process.env.DATABASE_URL) return [];
    try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(process.env.DATABASE_URL);
        return await sql`
            SELECT name, tagline, description, url, category, featured, discovered_at
            FROM directory_entries WHERE status = 'live'
            ORDER BY featured DESC, featured_rank ASC, discovered_at DESC LIMIT 300`;
    } catch (err) {
        console.warn('[seo] could not read listings, continuing without prerender:', err.message);
        return [];
    }
}

const listings = await loadListings();
console.log(`[seo] prerendering ${listings.length} listings`);

// Real markup a crawler can read without executing JavaScript. The client
// replaces this wholesale once the live directory loads.
const prerendered = listings.slice(0, 120).map(item => `
<article class="seo-launch">
  <h3>${escapeHtml(item.name)}</h3>
  <p>${escapeHtml(item.tagline)}</p>
  <p>${escapeHtml(item.description)}</p>
  <a href="${escapeHtml(item.url)}" rel="noopener nofollow">${escapeHtml(item.name)}</a>
  <span>${escapeHtml(item.category)}</span>
</article>`).join('');

const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Newly launched SaaS products',
    numberOfItems: listings.length,
    itemListElement: listings.slice(0, 100).map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
            '@type': 'SoftwareApplication',
            name: item.name,
            description: item.tagline,
            url: item.url,
            applicationCategory: item.category,
        },
    })),
};

const orgAndSite = [
    {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'FreshSAAS',
        url: SITE,
        description: 'A daily directory of newly launched SaaS products, and a marketplace for buying and selling them.',
    },
    {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'FreshSAAS',
        url: SITE,
        potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/?q={search_term_string}` },
            'query-input': 'required name=search_term_string',
        },
    },
];

const indexPath = join(dist, 'index.html');
let html = readFileSync(indexPath, 'utf8');

const structuredData = [orgAndSite[0], orgAndSite[1], itemList]
    .map(data => `<script type="application/ld+json">${JSON.stringify(data)}</script>`)
    .join('\n');

html = html.replace('</head>', `${structuredData}\n</head>`);
// Placed at the end of body: crawlable, and hidden from readers since the
// interactive grid above renders the same data.
html = html.replace('</body>', `<div id="seo-launches" hidden aria-hidden="true">${prerendered}</div>\n</body>`);
writeFileSync(indexPath, html);

const urls = [
    { loc: `${SITE}/`, priority: '1.0', freq: 'hourly' },
    { loc: `${SITE}/#discover`, priority: '0.8', freq: 'hourly' },
    { loc: `${SITE}/#marketplace`, priority: '0.8', freq: 'daily' },
    { loc: `${SITE}/#founders`, priority: '0.6', freq: 'weekly' },
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
writeFileSync(join(dist, 'sitemap.xml'), sitemap);

writeFileSync(join(dist, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /account.html
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`);

console.log('[seo] wrote sitemap.xml, robots.txt and structured data');
