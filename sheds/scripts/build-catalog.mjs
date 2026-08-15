/**
 * Turns the supplier snapshot into the catalogue the site is built from.
 *
 * Reads `data/supplier-snapshot.json` (committed, so a build never depends on
 * the supplier's site being up) and writes `data/catalog.json`, normalized and
 * with the dealer's margin applied. Both files are in git on purpose: the diff
 * on a refresh is the record of what the supplier changed — what sold, what
 * arrived, which prices moved — and that is worth being able to read.
 *
 *   npm run catalog             rebuild from the committed snapshot
 *   npm run catalog -- --fetch  pull a fresh snapshot first, then rebuild
 *
 * `--fetch` reads the supplier's public Shopify product feed. It is a read of
 * published catalogue data, the same thing their storefront serves to any
 * browser, and it touches nothing else — their robots.txt permits crawling and
 * forbids automated checkout, which this does not go near.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { normalizeProduct, TYPE_LABELS } from '../src/lib/normalize.ts';
import { dealerPriceCents, DEALER } from '../src/lib/dealer.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const snapshotPath = join(dataDir, 'supplier-snapshot.json');
const catalogPath = join(dataDir, 'catalog.json');

const SUPPLIER_FEED = 'https://www.infinitesheds.com/products.json?limit=250';

if (process.argv.includes('--fetch')) {
    process.stdout.write(`fetching ${SUPPLIER_FEED}\n`);
    const res = await fetch(SUPPLIER_FEED);
    if (!res.ok) throw new Error(`supplier feed returned ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body.products) || body.products.length === 0) {
        // A feed that parses but is empty would otherwise overwrite a good
        // snapshot with nothing and quietly empty the whole site.
        throw new Error('supplier feed returned no products — keeping the existing snapshot');
    }
    writeFileSync(snapshotPath, `${JSON.stringify(body, null, 2)}\n`);
    process.stdout.write(`snapshot updated: ${body.products.length} products\n`);
}

const raw = JSON.parse(readFileSync(snapshotPath, 'utf8')).products;

const buildings = raw
    .map(normalizeProduct)
    .filter(Boolean)
    .map((b) => ({ ...b, priceCents: dealerPriceCents(b.priceCents) }))
    .sort((a, b) => a.priceCents - b.priceCents);

const skipped = raw.length - buildings.length;

/**
 * Facet values are derived from the stock rather than hardcoded, so a filter
 * can never offer a choice that matches nothing — an empty result from a
 * control the site itself put there reads as a broken site.
 */
const distinct = (pick) => [...new Set(buildings.flatMap(pick))].filter(Boolean);
const byCount = (values) => {
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

const catalog = {
    /**
     * Which snapshot this was built from, as a hash of the snapshot itself.
     *
     * This was a wall-clock `generatedAt`, which was worse than useless: it
     * changed on every build, so the file showed as modified after any `npm
     * run build`, every commit carried a meaningless one-line diff, and the
     * one reason to commit a generated file — that its diff is the record of
     * what the supplier changed — was buried in timestamp noise.
     *
     * A hash of the source says the thing actually worth knowing (which
     * snapshot produced this) and is stable across rebuilds, so building
     * twice leaves the working tree clean. CI asserts exactly that.
     */
    snapshot: createHash('sha256').update(readFileSync(snapshotPath)).digest('hex').slice(0, 16),
    supplier: DEALER.supplier.name,
    count: buildings.length,
    facets: {
        types: byCount(buildings.map((b) => b.type)).map(([value, count]) => ({
            value, count, label: TYPE_LABELS[value],
        })),
        editions: byCount(buildings.map((b) => b.edition).filter(Boolean)),
        sidings: byCount(buildings.map((b) => b.siding).filter(Boolean)),
        colors: byCount(buildings.map((b) => b.sidingColor).filter(Boolean)),
        features: byCount(buildings.flatMap((b) => b.features)),
        widths: distinct((b) => [b.size.width]).sort((a, b) => a - b),
        priceCents: {
            min: Math.min(...buildings.map((b) => b.priceCents)),
            max: Math.max(...buildings.map((b) => b.priceCents)),
        },
    },
    buildings,
};

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

process.stdout.write(
    `catalog.json: ${buildings.length} buildings, ${skipped} non-building entr${skipped === 1 ? 'y' : 'ies'} skipped\n`
    + `  types    ${catalog.facets.types.map((t) => `${t.label} ${t.count}`).join(', ')}\n`
    + `  widths   ${catalog.facets.widths.join(', ')} ft\n`
    + `  prices   $${Math.round(catalog.facets.priceCents.min / 100).toLocaleString()}`
    + `–$${Math.round(catalog.facets.priceCents.max / 100).toLocaleString()}\n`,
);
