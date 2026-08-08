/**
 * Writes the whole site to dist/.
 *
 * There is no bundler. The site is a homepage, a catalogue, three text pages
 * and one static page per building — none of which needs a module graph, and
 * the point of the project is that the thing it replaces is slow. A build
 * step that only concatenates and copies is also a build step that cannot
 * quietly add 200 KB of runtime.
 */
import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import {
    homePage, catalogPage, buildingPage, simplePage, quoteForm,
} from '../src/lib/templates.ts';
import { html, raw } from '../src/lib/html.ts';
import { DEALER } from '../src/lib/dealer.ts';
import { TYPE_LABELS } from '../src/lib/normalize.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');

const catalog = JSON.parse(readFileSync(join(root, 'data', 'catalog.json'), 'utf8'));
const { buildings, facets } = catalog;

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'b'), { recursive: true });
cpSync(join(root, 'public'), dist, { recursive: true });

const write = (path, contents) => {
    writeFileSync(join(dist, path), contents);
    return contents.length;
};

write('index.html', homePage(buildings, facets));
write('buildings.html', catalogPage(buildings, facets));

/**
 * Related buildings: same type, nearest in price, never itself.
 *
 * Same type rather than same price band, because someone looking at a garage
 * is looking at garages. Nearest in price rather than cheapest, so the row
 * reads as alternatives rather than as an upsell.
 */
function relatedTo(target) {
    return buildings
        .filter((b) => b.type === target.type && b.id !== target.id)
        .sort((a, b) => Math.abs(a.priceCents - target.priceCents) - Math.abs(b.priceCents - target.priceCents))
        .slice(0, 4);
}

let buildingBytes = 0;
for (const b of buildings) {
    buildingBytes += write(`b/${b.id}.html`, buildingPage(b, relatedTo(b)));
}

write('services.html', simplePage({
    title: `Delivery, setup and site prep | ${DEALER.name}`,
    description: 'What happens after you pick a building: access, ground prep, delivery day and what we need from you.',
    path: '/services.html',
}, html`
<h1>Getting it into your yard</h1>
<p class="lede">The building is the easy part. Here is the rest of it, honestly, including the bits that occasionally go wrong.</p>

<h2>Access</h2>
<p>A building is delivered on a shed mule — a remote-controlled trailer that drives it into place. It needs a clear route roughly two feet wider than the building, and it does not do well on soft ground, steep slopes or tight gate posts. Send a photo of the route when you call and we will tell you before delivery day, not on it.</p>

<h2>Ground</h2>
<p>Buildings sit on pressure-treated skids and need level, firm ground. Gravel pads are the usual answer and the cheapest one; blocks work on a modest slope. A yard that slopes more than about a foot across the length of the building needs prep before delivery, and that is a real cost worth knowing about early.</p>

<h2>Permits</h2>
<p>Rules are local and genuinely vary street to street. Many townships need nothing for a building under a certain footprint; some need a zoning permit whatever the size, and HOAs have their own views. Check with your township before you buy — we will tell you the footprint and height you need to quote them.</p>

<h2>What is included</h2>
<ul>
  <li>Delivery and placement on prepared ground</li>
  <li>Levelling on blocks as needed</li>
  <li>Removal of all packaging and offcuts</li>
</ul>

<h2>What is not</h2>
<ul>
  <li>Site preparation, gravel pads and excavation</li>
  <li>Permits and any HOA approval</li>
  <li>Electrical hookup — the electrical package is prewired, but connecting it to your supply is a licensed job</li>
  <li>Removal of an existing building, unless quoted separately</li>
</ul>
`));

write('about.html', simplePage({
    title: `About ${DEALER.name}`,
    description: `${DEALER.name} is an authorised dealer for ${DEALER.supplier.name}.`,
    path: '/about.html',
}, html`
<h1>About ${DEALER.name}</h1>
<p class="lede">We are an authorised dealer for ${DEALER.supplier.name} — ${DEALER.supplier.blurb}.</p>
<p>Everything on this site is a building that already exists. It has been framed, sided, roofed and photographed, and the photographs on its page are of that building rather than of a rendering or of a similar one. When you pick one, that is the one that arrives.</p>
<p>Prices on this site are what the building costs, delivered and set up on prepared ground. There is no configurator that ends in "call for pricing" and no quote that arrives two days later with a number attached.</p>
<h2>Why buy from a dealer</h2>
<p>The same building, the same warranty, and someone local who answers the phone and comes out to look at your yard. If something is wrong after delivery, you are calling a person who has been to your address.</p>
`));

write('contact.html', simplePage({
    title: `Contact ${DEALER.name}`,
    description: `Call ${DEALER.phone} or send a message and we will get back to you the same day.`,
    path: '/contact.html',
}, html`
<h1>Talk to us</h1>
<p class="lede">Call <a href="tel:${raw(DEALER.phone.replace(/[^\d+]/g, ''))}">${DEALER.phone}</a>, ${DEALER.hours.toLowerCase()}. Or send this and we will call you back.</p>
${quoteForm(null)}
`));

write('thanks.html', simplePage({
    title: `Thanks — we'll call you back | ${DEALER.name}`,
    description: 'Your message reached us.',
    path: '/thanks.html',
}, html`
<h1>Got it.</h1>
<p class="lede">We will call you back ${DEALER.hours.toLowerCase()}. If it is urgent, ring <a href="tel:${raw(DEALER.phone.replace(/[^\d+]/g, ''))}">${DEALER.phone}</a> and you will get a person.</p>
<p><a class="btn" href="/buildings.html">Keep looking →</a></p>
`));

// sitemap + robots: a dealer site lives or dies on search, and 202 pages that
// nothing links to from outside are worth declaring explicitly.
const urls = [
    '/', '/buildings.html', '/services.html', '/about.html', '/contact.html',
    ...buildings.map((b) => `/b/${b.id}.html`),
];
write('sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((u) => `  <url><loc>${DEALER.siteUrl}${u}</loc></url>`).join('\n')
    + `\n</urlset>\n`);

write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${DEALER.siteUrl}/sitemap.xml\n`);

// --- report ----------------------------------------------------------------

const size = (p) => statSync(join(dist, p)).size;
const totalDist = readdirSync(dist, { recursive: true })
    .map((f) => join(dist, String(f)))
    .filter((f) => statSync(f).isFile())
    .reduce((n, f) => n + statSync(f).size, 0);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
process.stdout.write(
    `dist/ built\n`
    + `  index.html      ${kb(size('index.html'))}\n`
    + `  buildings.html  ${kb(size('buildings.html'))}  (${buildings.length} buildings, all in the HTML)\n`
    + `  b/*.html        ${buildings.length} pages, ${kb(buildingBytes / buildings.length)} average\n`
    + `  site.css        ${kb(size('site.css'))}\n`
    + `  filters.js      ${kb(size('filters.js'))}\n`
    + `  total           ${kb(totalDist)}\n`,
);
