/**
 * Turns the supplier's product feed into something a buyer can filter.
 *
 * The feed describes each building almost entirely inside its title, and the
 * titles were written by hand over several years. Across 198 buildings there
 * are 48 distinct "style" strings for roughly a dozen actual building types,
 * three different characters used for the size separator (`x`, `×`), two for
 * the name separator (`-`, `–`), "Batton" for "Batten", "Lapp" for "Lap", and
 * `Maxibarn`/`MaxiBarn` used interchangeably. Siding is baked into the style
 * name, so "Vinyl Workshop" and "Workshop" are the same building with
 * different cladding and sort as different products.
 *
 * That is the whole reason the supplier's own site offers no filtering beyond
 * hand-curated collections: you cannot filter on a field that does not exist.
 * Everything here exists to pull the four facts a shed buyer actually shops on
 * — how big, what kind, how it is clad, how much — out of that prose and into
 * real fields.
 *
 * Every function is pure and takes its input explicitly, so the whole thing is
 * testable against the real feed without a network call. `tests/normalize.
 * test.mjs` runs it over the committed snapshot and fails if any building
 * comes out without a size or lands in the fallback type — the feed changes
 * when the supplier adds stock, and a silent misparse would put a $12,000
 * garage in the wrong filter rather than crash.
 */

export type BuildingType =
    | 'workshop' | 'garage' | 'maxibarn' | 'minibarn' | 'saltbox'
    | 'greenhouse' | 'sauna' | 'modern' | 'nordic' | 'villa'
    | 'western' | 'bar' | 'playhouse' | 'equine';

/** Trim level. The supplier's four tiers, cheapest first. */
export type Edition = 'economy' | 'standard' | 'classic' | 'estate';

export type Siding = 'vinyl' | 'board-batten' | 'lap' | 'lp-smart' | 'wood';

export interface Size { width: number; length: number; sqft: number }

export interface Building {
    id: string;
    sourceHandle: string;
    title: string;
    type: BuildingType;
    size: Size;
    edition: Edition | null;
    siding: Siding | null;
    features: string[];
    priceCents: number;
    images: string[];
    /** Bullet list of what the base price includes, from the supplier's copy. */
    specs: string[];
    /** Upgrades already fitted to this particular building. */
    included: string[];
    /** Colour choices already made on this building, e.g. Fascia -> Forest Green. */
    colors: Array<{ part: string; color: string }>;
    /**
     * What colour the walls are, when the feed says.
     *
     * A separate facet from `siding` because the supplier records the two
     * independently and unevenly: 41% of the stock never states the cladding
     * material, but almost all of it names the colour, because the colour is
     * what the person walking the lot asks about. Filtering on the field that
     * is actually populated beats filtering on the one that ought to be.
     */
    sidingColor: string | null;
}

export const TYPE_LABELS: Record<BuildingType, string> = {
    workshop: 'Workshop', garage: 'Garage', maxibarn: 'MaxiBarn',
    minibarn: 'MiniBarn', saltbox: 'Saltbox', greenhouse: 'Greenhouse',
    sauna: 'Sauna', modern: 'Modern Studio', nordic: 'Nordic',
    villa: 'Villa', western: 'Western', bar: 'Pool Bar',
    playhouse: 'Playhouse', equine: 'Run-In Shelter',
};

export const EDITION_LABELS: Record<Edition, string> = {
    economy: 'Economy', standard: 'Standard', classic: 'Classic', estate: 'Estate',
};

export const SIDING_LABELS: Record<Siding, string> = {
    vinyl: 'Vinyl', 'board-batten': 'Board & Batten', lap: 'Lap / Clapboard',
    'lp-smart': 'LP SmartSide', wood: 'Wood',
};

/**
 * Order matters and is the only thing making this correct.
 *
 * The names overlap: "Nordic Sauna" is a sauna, not a Nordic; "MaxiBarn
 * Garage" is a garage in a MaxiBarn shell, and someone shopping for a garage
 * must find it. So the most specific claim on a building wins, and the
 * general shapes are tested last. `workshop` is deliberately absent — it is
 * the fallback, applied only when nothing else matches, because "Workshop" is
 * both a real style and what the supplier calls anything unremarkable.
 */
const TYPE_RULES: Array<[BuildingType, RegExp]> = [
    ['sauna', /\bsauna\b/i],
    ['greenhouse', /\bgreen\s*house\b/i],
    ['equine', /\bequine\b|\brun-?in\b/i],
    ['playhouse', /\bplay\s*house\b/i],
    ['bar', /\bbar\b/i],
    ['garage', /\bgarage\b/i],
    ['villa', /\bvilla\b/i],
    ['nordic', /\bnordic\b/i],
    ['modern', /\bmodern\b|\bstudio\b/i],
    ['western', /\bwestern\b/i],
    ['saltbox', /\bsalt\s*box\b/i],
    ['minibarn', /\bmini\s*barn\b/i],
    ['maxibarn', /\bmaxi\s*barn\b/i],
];

/**
 * Width and length, in feet, from the front of the title.
 *
 * Both `x` and the true multiplication sign `×` appear in the feed — the
 * latter in 12 titles, almost certainly from a word processor's autocorrect —
 * and a parser that only knows `x` drops those twelve buildings out of every
 * size filter without any visible error.
 */
export function parseSize(title: string): Size | null {
    const m = /^\s*(\d{1,3})\s*[x×]\s*(\d{1,3})\b/i.exec(title);
    if (!m) return null;
    const width = Number(m[1]);
    const length = Number(m[2]);
    if (!width || !length) return null;
    return { width, length, sqft: width * length };
}

export function parseType(title: string, tags: string[] = []): BuildingType {
    const haystack = `${title} ${tags.join(' ')}`;
    for (const [type, pattern] of TYPE_RULES) {
        if (pattern.test(haystack)) return type;
    }
    return 'workshop';
}

/**
 * The trim level, which is a different axis from the building's shape.
 *
 * Only the four tier words count. The feed also uses "… Edition" for things
 * that are not tiers at all — "Porch Edition", "Sun & Shade Edition" — and
 * reading those as a trim level would invent tiers that the supplier does not
 * sell and that no price list backs up.
 */
export function parseEdition(title: string): Edition | null {
    if (/\beconomy\b/i.test(title)) return 'economy';
    if (/\bestate\b/i.test(title)) return 'estate';
    if (/\bclassic\b/i.test(title)) return 'classic';
    if (/\bstandard\b/i.test(title)) return 'standard';
    return null;
}

/**
 * Cladding, from the title and tags together.
 *
 * Checked most-specific first: "LP Board & Batten" has to be read as board
 * and batten rather than falling through to a generic LP match. Wood is last
 * because a stained-siding tag is the supplier's way of saying bare wood, and
 * it co-occurs with every other siding type as a finish note.
 */
export function parseSiding(title: string, tags: string[] = []): Siding | null {
    const hay = `${title} ${tags.join(' ')}`;
    if (/\bvinyl\b/i.test(hay)) return 'vinyl';
    // "Batten" and the "Batton" typo, which is live on two products.
    if (/board\s*&?\s*batt[eo]n\b|\bb\s*&\s*b\b/i.test(hay)) return 'board-batten';
    if (/\blapp?\s*siding\b|\bclapboard\b/i.test(hay)) return 'lap';
    if (/\bsmart\s*side\b|\blp\s*smart\b/i.test(hay)) return 'lp-smart';
    if (/\bwood\b|\bstained\s+siding\b|\bpine\b/i.test(hay)) return 'wood';
    return null;
}

/**
 * Things a buyer filters for that are neither shape nor cladding: a porch, a
 * loft, a metal roof. Sourced from tags and title together because the feed
 * puts them in whichever field the person adding the building reached for.
 */
const FEATURE_RULES: Array<[string, RegExp]> = [
    ['Porch', /\bporch\b/i],
    ['Loft', /\bloft\b/i],
    ['Dormer', /\bdormer\b/i],
    ['Metal roof', /\bmetal\s*roof\b|\bribbed\b/i],
    ['Workbench', /\bwork\s*bench\b/i],
    ['Shelving', /\bshel(f|ves|ving)\b/i],
    ['Electric package', /\belectric\b/i],
    ['Ramp', /\bramp\b/i],
    ['Insulated', /\binsulat/i],
    ['Transom windows', /\btransom\b/i],
    ['Ridge vent', /\bridge\s*vent\b/i],
    ['Two storey', /\b2-?\s*story\b|\btwo\s*story\b/i],
    ['Hip roof', /\bhip\s*roof\b/i],
    ['Wood heater', /\bwood\s*heater\b/i],
    ['Custom paint', /\bcustom\s*paint\b/i],
    ['6ft walls', /\b6'?\s*high\s*walls\b/i],
];

export function parseFeatures(title: string, tags: string[] = []): string[] {
    const hay = `${title} ${tags.join(' ')}`;
    return FEATURE_RULES.filter(([, re]) => re.test(hay)).map(([label]) => label);
}

/**
 * A display title with the size stripped (the size is shown as its own field)
 * and the separator characters made consistent.
 */
export function cleanTitle(title: string): string {
    return title
        .replace(/\s*[–—]\s*/g, ' – ')
        .replace(/(\S)-\s+/g, '$1 – ')
        .replace(/\s{2,}/g, ' ')
        .replace(/×/g, 'x')
        .trim();
}

/**
 * A URL slug that stays stable when the supplier retitles a building.
 *
 * Built from the supplier's own handle rather than from the title: the titles
 * get edited (a typo fixed, "Edition" added) and every rebuild would mint new
 * URLs, breaking every link and every page Google had indexed. Handles are
 * the one identifier in the feed that the supplier's own storefront depends
 * on, so they are the one thing that does not casually change.
 */
export function slugFor(handle: string): string {
    return handle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * The same photograph, resized by the CDN.
 *
 * The feed's image URLs are the originals straight off a phone camera — the
 * one measured was **1.66 MB**, and a catalogue page carries 198 of them. Left
 * alone that is 329 MB of photographs behind a page whose entire selling point
 * is that it loads fast, and lazy-loading only defers the problem to whoever
 * scrolls.
 *
 * Shopify's CDN resizes on request: the same image at `width=480` is 53 KB,
 * thirty-one times smaller, and visually identical at the size a card
 * actually renders. The parameter is appended rather than replacing the query
 * string because the URL already carries a `v=` cache-buster that must
 * survive — dropping it serves a stale image forever.
 *
 * Anything that is not a Shopify CDN URL is returned untouched, so mirroring
 * the photographs later to the dealer's own storage needs no change here.
 */
export function sized(url: string, width: number): string {
    if (!/^https:\/\/cdn\.shopify\.com\//i.test(url)) return url;
    if (/[?&]width=/.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
}

/** Money as integer cents. Floats are not allowed anywhere near a price. */
export function priceToCents(price: string | number): number {
    return Math.round(Number(price) * 100);
}

interface RawImage { src: string }
interface RawVariant { price: string }
export interface RawProduct {
    handle: string;
    title: string;
    body_html: string | null;
    tags: string[];
    images: RawImage[];
    variants: RawVariant[];
}

/**
 * The supplier writes each description as: a bullet list of what the base
 * price covers, a `——- Features above included in base price ——-` divider,
 * a second list of upgrades already fitted to this specific building, then a
 * `Colors` heading and the colour choices as `Part: Colour`.
 *
 * The divider is what makes the split possible, and it is typed by hand, so
 * it is matched loosely — any run of dashes around the words. When it is
 * missing entirely every bullet is treated as a base spec, which understates
 * the building rather than inventing upgrades it does not have.
 */
export function parseDescription(bodyHtml: string | null): Pick<Building, 'specs' | 'included' | 'colors'> {
    if (!bodyHtml) return { specs: [], included: [], colors: [] };

    const items = [...bodyHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
        .map((m) => stripHtml(m[1]))
        .filter(Boolean);

    // The divider is typed by hand and comes out as em-dashes, en-dashes,
    // hyphens or a mix — matching only ASCII hyphens misses most of the feed
    // and silently files every fitted upgrade as a base spec.
    const dividerAt = bodyHtml.search(/[-–—]{2,}\s*features above included/i);
    const colorsAt = bodyHtml.search(/<p>\s*colou?rs?\s*<\/p>/i);

    const before = (index: number): number =>
        index < 0 ? Number.MAX_SAFE_INTEGER
            : [...bodyHtml.slice(0, index).matchAll(/<li>/gi)].length;

    const upgradesStart = before(dividerAt);
    const colorsStart = before(colorsAt);

    const specs: string[] = [];
    const included: string[] = [];
    const colors: Array<{ part: string; color: string }> = [];

    items.forEach((text, i) => {
        if (i >= colorsStart) {
            const [part, ...rest] = text.split(':');
            if (rest.length) colors.push({ part: part.trim(), color: rest.join(':').trim() });
            return;
        }
        if (i >= upgradesStart) included.push(text);
        else specs.push(text);
    });

    return { specs, included, colors };
}

/**
 * The wall colour, from wherever this particular description happened to put
 * it. Most list it under `Colors` as `Siding: <colour>`; some put the same
 * line among the base specs instead, so both are searched. "Custom" is
 * discarded — it is the supplier declining to say, and it would otherwise
 * become the single largest entry in a colour filter while meaning nothing.
 */
export function parseSidingColor(
    colors: Array<{ part: string; color: string }>,
    specs: string[],
): string | null {
    const listed = colors.find((c) => /^siding\b/i.test(c.part))?.color;
    const inSpecs = specs
        .map((s) => /^\s*siding\s*:\s*(.+)$/i.exec(s)?.[1])
        .find(Boolean);

    const found = (listed ?? inSpecs ?? '').trim();
    if (!found || /^custom$/i.test(found)) return null;
    return found;
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        // Numeric entities first: the feed writes dimensions as 2&#215;4, and
        // leaving them encoded puts raw entity text on the page.
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        // Ampersand last, so "&amp;#215;" cannot be decoded twice into a
        // character the supplier never wrote.
        .replace(/&amp;/g, '&')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * A product with no size in its title is not a building — the feed carries a
 * "Standard Paint Options" entry at $0 as a way of publishing the colour
 * chart. Returning null rather than guessing keeps non-buildings out of a
 * catalogue where every entry is supposed to be purchasable.
 */
export function normalizeProduct(raw: RawProduct): Building | null {
    const size = parseSize(raw.title);
    if (!size) return null;

    const priceCents = priceToCents(raw.variants[0]?.price ?? 0);
    // Number('call for pricing') is NaN, and NaN <= 0 is false — so a bare
    // `<= 0` check lets a building through with a NaN price, which renders as
    // "$NaN" on a live page rather than failing anywhere a build would notice.
    if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return null;

    const described = parseDescription(raw.body_html);

    return {
        sidingColor: parseSidingColor(described.colors, described.specs),
        id: slugFor(raw.handle),
        sourceHandle: raw.handle,
        title: cleanTitle(raw.title),
        type: parseType(raw.title, raw.tags),
        size,
        edition: parseEdition(raw.title),
        siding: parseSiding(raw.title, raw.tags),
        features: parseFeatures(raw.title, raw.tags),
        priceCents,
        images: raw.images.map((i) => i.src),
        ...described,
    };
}
