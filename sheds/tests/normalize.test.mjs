import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    parseSize, parseType, parseEdition, parseSiding, parseFeatures,
    cleanTitle, slugFor, priceToCents, parseDescription, parseSidingColor,
    normalizeProduct, sized,
} from '../src/lib/normalize.ts';

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(
    readFileSync(join(here, '..', 'data', 'supplier-snapshot.json'), 'utf8'),
).products;

test('both size separators in the feed are understood', () => {
    // 12 of the 198 titles use the true multiplication sign, almost certainly
    // from an autocorrect. A parser that only knows "x" drops them out of
    // every size filter silently — nothing errors, they just stop existing.
    assert.deepEqual(parseSize('10x16 Workshop'), { width: 10, length: 16, sqft: 160 });
    assert.deepEqual(parseSize('10×16 Workshop'), { width: 10, length: 16, sqft: 160 });
    assert.deepEqual(parseSize('8 x 12 Greenhouse'), { width: 8, length: 12, sqft: 96 });
    assert.equal(parseSize('Standard Paint Options'), null);
});

test('a more specific type beats a general one', () => {
    // These four are the reason parse order is fixed rather than alphabetical.
    assert.equal(parseType('8x10 Nordic Sauna- Wood Heater'), 'sauna', 'a Nordic Sauna is a sauna');
    assert.equal(parseType('12x20 Maxibarn Garage'), 'garage', 'someone shopping garages must find it');
    assert.equal(parseType('10x20 Saltbox Garage – Standard Edition'), 'garage');
    assert.equal(parseType('10x16 Nordic'), 'nordic');
});

test('anything unrecognised falls back to workshop, never to nothing', () => {
    // The supplier calls anything unremarkable a Workshop, so the fallback is
    // the honest answer rather than an "Other" bucket nobody clicks.
    assert.equal(parseType('12x16 Something Nobody Has Sold Before'), 'workshop');
});

test('only real trim tiers count as an edition', () => {
    assert.equal(parseEdition('10x14 Workshop- Classic Edition'), 'classic');
    assert.equal(parseEdition('8x12 Workshop – Economy Edition'), 'economy');
    // "Porch Edition" and "Sun & Shade Edition" are not trim levels. Reading
    // them as one would invent tiers the supplier does not sell.
    assert.equal(parseEdition('12x24 Workshop- Porch Edition'), null);
    assert.equal(parseEdition('10x22 Greenhouse- Sun & Shade Edition'), null);
});

test('an edition named anywhere in the title is found', () => {
    // The feed writes the tier both before and after the style.
    assert.equal(parseEdition('12x14 Standard Workshop- Porch Edition'), 'standard');
    assert.equal(parseEdition('10x12 Maxibarn- Standard Edition'), 'standard');
});

test('the supplier spells board & batten four ways', () => {
    // Including the "Batton" typo, which is in the live feed on two products.
    for (const title of [
        '10x12 Board & Batten Workshop',
        '10×14 B&B Workshop- Classic Edition',
        '10×16 Board & Batton Villa',
        '12x18 Western- Board & Batton LP Siding',
    ]) {
        assert.equal(parseSiding(title), 'board-batten', `misread: ${title}`);
    }
});

test('lap siding is found under all three of its names', () => {
    assert.equal(parseSiding('10x12 Lap Siding Workshop'), 'lap');
    assert.equal(parseSiding('12x24 LP Lapp Siding Workshop'), 'lap');
    assert.equal(parseSiding('12x20 Clapboard Garage'), 'lap');
});

test('siding is read from tags when the title omits it', () => {
    // Which is the common case: the title says "Workshop" and only the tags
    // say what it is clad in.
    assert.equal(parseSiding('10x16 Workshop- Classic Edition', ['Siding Vinyl']), 'vinyl');
    assert.equal(parseSiding('10x16 Workshop', ['Siding: B&B']), 'board-batten');
});

test('vinyl wins over a stained-siding finish note', () => {
    // "Stained Siding" is a finish tag that co-occurs with real cladding
    // types. Read as a siding in its own right it would relabel vinyl
    // buildings as wood.
    assert.equal(parseSiding('10x14 Vinyl Workshop', ['Stained Siding']), 'vinyl');
});

test('features come from tags and title together', () => {
    const f = parseFeatures('12x20 Standard Workshop w/ Porch', ['Loft', 'Metal Roof Ribbed']);
    assert.ok(f.includes('Porch'));
    assert.ok(f.includes('Loft'));
    assert.ok(f.includes('Metal roof'));
    assert.ok(!f.includes('Dormer'));
});

test('slugs come from the handle, not the title', () => {
    // Titles get edited — a typo fixed, "Edition" appended — and if the URL
    // followed the title, every rebuild would mint new URLs and break every
    // indexed page and every link a customer had been sent.
    assert.equal(slugFor('10x10-workshop-estate-edition'), '10x10-workshop-estate-edition');
    assert.equal(slugFor('10X12_Vinyl--Saltbox!'), '10x12-vinyl-saltbox');
});

test('prices become integer cents', () => {
    assert.equal(priceToCents('3465.00'), 346500);
    assert.equal(priceToCents('4226.50'), 422650);
    // 8.28 * 100 is 827.9999... in binary floating point; rounding is what
    // stops a price ending in a cent less than it should.
    assert.equal(priceToCents('8.28'), 828);
});

test('the description splits into base specs, fitted upgrades and colours', () => {
    const { specs, included, colors } = parseDescription(`
        <p>10x10 Workshop</p>
        <ul><li>4x4 Pressure Treated Skids</li><li>Architectural Shingles</li></ul>
        <p>——- Features above included in base price ——-</p>
        <ul><li>Deluxe Gable Vents</li><li>Ribbed Metal Roof</li></ul>
        <p>Colors</p>
        <ul><li>Siding: Stained Natural Cedar</li><li>Fascia: Forest Green</li></ul>`);

    assert.deepEqual(specs, ['4x4 Pressure Treated Skids', 'Architectural Shingles']);
    assert.deepEqual(included, ['Deluxe Gable Vents', 'Ribbed Metal Roof']);
    assert.deepEqual(colors, [
        { part: 'Siding', color: 'Stained Natural Cedar' },
        { part: 'Fascia', color: 'Forest Green' },
    ]);
});

test('a description with no divider claims no upgrades', () => {
    // Understating the building is recoverable; listing upgrades it does not
    // have is a customer arriving to collect something that is not there.
    const { specs, included } = parseDescription('<ul><li>Skids</li><li>Shingles</li></ul>');
    assert.deepEqual(specs, ['Skids', 'Shingles']);
    assert.deepEqual(included, []);
});

test('entities and nested markup are decoded, not shown raw', () => {
    const { specs } = parseDescription('<ul><li>2&#215;4 Walls &amp; Trusses<br></li></ul>');
    assert.deepEqual(specs, ['2×4 Walls & Trusses']);
});

test('non-buildings are dropped rather than guessed at', () => {
    // The feed publishes its colour chart as a $0 product with no size.
    assert.equal(normalizeProduct({
        handle: 'standard-paint-options', title: 'Standard Paint Options',
        body_html: '', tags: [], images: [], variants: [{ price: '0.00' }],
    }), null);
});

// ---------------------------------------------------------------------------
// Against the real feed. These are the tests that will actually catch a
// regression: the supplier edits this data by hand and adds stock weekly.
// ---------------------------------------------------------------------------

test('every building in the live feed parses', () => {
    const buildings = snapshot.map(normalizeProduct).filter(Boolean);

    // 198 of 199 — the one dropped is the colour chart.
    assert.equal(buildings.length, 198, 'a building stopped parsing, or a non-building started');

    for (const b of buildings) {
        assert.ok(b.size.width > 0 && b.size.length > 0, `${b.title}: no size`);
        assert.ok(b.priceCents > 0, `${b.title}: no price`);
        assert.ok(b.images.length > 0, `${b.title}: no images`);
        assert.ok(b.id, `${b.title}: no slug`);
    }
});

test('slugs are unique across the whole feed', () => {
    // Two buildings sharing a slug would silently overwrite each other's page
    // at build time, and the loss is invisible — the catalogue just has one
    // fewer building than the supplier does.
    const buildings = snapshot.map(normalizeProduct).filter(Boolean);
    const seen = new Map();
    for (const b of buildings) {
        assert.ok(!seen.has(b.id), `slug "${b.id}" is used by two buildings`);
        seen.set(b.id, b.title);
    }
});

test('no more than a handful of buildings land in the fallback type', () => {
    // The fallback is legitimate — most of the feed genuinely is workshops —
    // but if a supplier rename pushed everything into it, the type filter
    // would quietly become useless while still appearing to work. Real
    // workshops are about half the feed, so a jump past 70% means the rules
    // stopped matching rather than the stock changing.
    const buildings = snapshot.map(normalizeProduct).filter(Boolean);
    const workshops = buildings.filter((b) => b.type === 'workshop').length;
    const share = workshops / buildings.length;
    assert.ok(share < 0.7, `${(share * 100).toFixed(0)}% fell back to workshop — the type rules have stopped matching`);
});

test('siding material is known for most, but not all, of the feed', () => {
    // The bound is 55%, not the 80% first assumed, and the difference is a
    // fact about the supplier rather than a weakness in the parser: 41% of
    // the stock never states a cladding material anywhere — not in the title,
    // not in the tags, not in the description. Asserting 80% here would have
    // meant either loosening the siding rules until they matched things that
    // are not siding, or a permanently red test. The floor still catches the
    // rules breaking outright.
    const buildings = snapshot.map(normalizeProduct).filter(Boolean);
    const withSiding = buildings.filter((b) => b.siding !== null).length;
    assert.ok(
        withSiding / buildings.length > 0.55,
        `only ${withSiding}/${buildings.length} buildings got a siding material`,
    );
});

test('siding colour is known for buildings that are already built', () => {
    // Colour is the better of the two facets — the supplier records it far
    // more reliably than the material, because it is what the person standing
    // on the lot asks about — and it exists only because the material
    // assertion above failed and sent me looking.
    //
    // Greenhouses are excluded, and that exclusion is the finding rather than
    // a convenience: they use a different description template entirely
    // ("Choose from multiple siding colors") because they are made to order,
    // so the colour genuinely has not been chosen yet. Only 3 of 23 name one.
    // Lumping them in drags a real 85% down to 77% and would have had me
    // loosening the parser to chase a number that was never there.
    const buildings = snapshot.map(normalizeProduct).filter(Boolean);
    const built = buildings.filter((b) => b.type !== 'greenhouse');
    const withColor = built.filter((b) => b.sidingColor !== null).length;
    assert.ok(
        withColor / built.length > 0.8,
        `only ${withColor}/${built.length} in-stock buildings got a siding colour`,
    );
});

test('"Custom" is not treated as a colour', () => {
    // It is the supplier declining to say. Kept as a value it would become
    // the largest entry in the colour filter while telling a buyer nothing.
    assert.equal(parseSidingColor([{ part: 'Siding', color: 'Custom' }], []), null);
    assert.equal(parseSidingColor([{ part: 'Siding', color: 'Boothbay Blue' }], []), 'Boothbay Blue');
    // Some descriptions put the same line among the base specs instead.
    assert.equal(parseSidingColor([], ['Siding: Mountain Sage']), 'Mountain Sage');
});

test('CDN images are requested at a sane size, keeping the cache-buster', () => {
    // The feed points at camera originals — one measured at 1.66 MB, and a
    // catalogue page carries 198 of them. The same image at width=480 is
    // 53 KB. The `v=` parameter has to survive: replacing the query string
    // instead of appending serves a stale photograph forever.
    const url = 'https://cdn.shopify.com/s/files/1/0686/x.jpg?v=1775936142';
    assert.equal(sized(url, 480), `${url}&width=480`);

    // No existing query string.
    assert.equal(
        sized('https://cdn.shopify.com/s/files/1/0686/x.jpg', 900),
        'https://cdn.shopify.com/s/files/1/0686/x.jpg?width=900',
    );

    // Already sized: left alone rather than given two conflicting widths.
    const already = 'https://cdn.shopify.com/s/files/x.jpg?width=400';
    assert.equal(sized(already, 900), already);

    // Not Shopify: untouched, so mirroring the photographs to the dealer's
    // own storage later needs no change here.
    assert.equal(sized('https://dealer.example/x.jpg', 480), 'https://dealer.example/x.jpg');
});

test('every image in the catalogue is a resizable CDN URL', () => {
    // If the supplier moved their images elsewhere, sized() would silently
    // stop doing anything and every page would go back to shipping originals.
    const buildings = snapshot.map(normalizeProduct).filter(Boolean);
    const offCdn = buildings.flatMap((b) => b.images).filter((u) => !u.startsWith('https://cdn.shopify.com/'));
    assert.deepEqual(offCdn, [], 'some images are no longer on the Shopify CDN — sized() is a no-op for those');
});
