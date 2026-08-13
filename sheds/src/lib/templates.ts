/**
 * Every page on the site, as functions returning HTML.
 *
 * The supplier's storefront ships 844 KB of markup on its homepage, 677 KB on
 * a single product page, and needs JavaScript to render either. That is the
 * thing being beaten, so the constraints here are deliberate: no framework,
 * no client-side rendering, no web fonts. A building page is real HTML that
 * is complete before any script runs, which is also what makes it indexable —
 * for a dealer, ranking on "10x16 shed" is the whole marketing budget.
 *
 * The one place JavaScript is used is filtering the catalogue, and even there
 * the unfiltered list is in the HTML first, so the page works without it.
 */
import { html, raw, join, esc, safeUrl, jsonForScript, type Raw } from './html.ts';
import { DEALER, formatPrice } from './dealer.ts';
import { TYPE_LABELS, EDITION_LABELS, SIDING_LABELS, sized, type Building } from './normalize.ts';

export interface PageOptions {
    title: string;
    description: string;
    /** Site-relative path, used for the canonical URL. */
    path: string;
    /** Absolute image URL for link previews. */
    image?: string;
    /** JSON-LD, as an object. Serialised and escaped at render time. */
    schema?: unknown;
    bodyClass?: string;
    script?: string;
}

const nav = [
    ['/buildings.html', 'Buildings'],
    ['/services.html', 'Delivery & setup'],
    ['/about.html', 'About'],
] as const;

export function page(options: PageOptions, body: Raw): string {
    const canonical = `${DEALER.siteUrl}${options.path}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(options.title)}</title>
<meta name="description" content="${esc(options.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(options.title)}">
<meta property="og:description" content="${esc(options.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="website">
${options.image ? `<meta property="og:image" content="${esc(safeUrl(options.image))}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#17160f">
<link rel="preload" href="/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/instrument-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
<link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
${options.schema ? `<script type="application/ld+json">${jsonForScript(options.schema)}</script>` : ''}
</head>
<body${options.bodyClass ? ` class="${esc(options.bodyClass)}"` : ''}>
${header()}
${body}
${footer()}
${options.script ? `<script type="module" src="${esc(options.script)}"></script>` : ''}
</body>
</html>
`;
}

function header(): string {
    return html`
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap head-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">${DEALER.name}</span>
    </a>
    <nav class="site-nav">
      ${nav.map(([href, label]) => html`<a href="${raw(safeUrl(href))}">${label}</a>`)}
    </nav>
    <a class="call" href="${raw(telHref())}">
      <span class="call-label">Call</span>
      <span class="call-number">${DEALER.phone}</span>
    </a>
  </div>
</header>`.toString();
}

function footer(): string {
    const { street, city, state, zip } = DEALER.address;
    const hasAddress = Boolean(street || city);
    return html`
<footer class="site-foot">
  <div class="wrap foot-inner">
    <div>
      <p class="foot-name">${DEALER.name}</p>
      <p>An authorised dealer for ${DEALER.supplier.name} — ${DEALER.supplier.blurb}.</p>
      ${hasAddress ? html`<p>${street}, ${city}, ${state} ${zip}</p>` : raw('')}
    </div>
    <div>
      <p><a href="${raw(telHref())}">${DEALER.phone}</a></p>
      <p><a href="mailto:${raw(encodeURIComponent(DEALER.email))}">${DEALER.email}</a></p>
      <p>${DEALER.hours}</p>
    </div>
  </div>
</footer>`.toString();
}

function telHref(): string {
    return `tel:${DEALER.phone.replace(/[^\d+]/g, '')}`;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function sizeLabel(b: Building): string {
    return `${b.size.width}×${b.size.length}`;
}

/**
 * A one-line summary of what the building is, assembled from the facets
 * rather than reprinting the supplier's title.
 *
 * The titles are the problem this project exists to solve — "10×14 Vinyl
 * Workshop – Estate Edition" buries the three things a buyer compares on
 * inside one string, and 48 different spellings of them means no two titles
 * describe the same thing the same way. Rebuilding the line from parsed
 * fields makes every card read identically.
 */
export function summaryLine(b: Building): string {
    const parts = [
        `${b.size.sqft} sq ft`,
        b.siding ? SIDING_LABELS[b.siding] : null,
        b.edition ? `${EDITION_LABELS[b.edition]} trim` : null,
    ].filter(Boolean);
    return parts.join(' · ');
}

/**
 * Every photograph on the site.
 *
 * `loading="lazy"` and explicit dimensions on all of them: a catalogue page is
 * 198 photographs, and without lazy loading the browser fetches the lot before
 * it will paint — most of why the supplier's own listing takes as long as it
 * does. Without width and height the page reflows as each one lands, moving
 * whatever someone was about to tap.
 *
 * Two srcset rungs for a card, four for a page that shows the photograph large.
 *
 * A srcset is not free: it is a full URL per rung, inline, per image. The
 * four-rung ladder cost the catalogue page 103 KB of HTML — 141 KB to 244 KB
 * across 198 cards — to serve image files that a 300px-wide card cannot tell
 * apart. Cards get 300 and 600 (one rung for ordinary screens, one for
 * retina) and the building page keeps the full range, where the lead
 * photograph really is displayed at 640px and really can use 1400.
 */
const CARD_WIDTHS = [300, 600];
const FULL_WIDTHS = [400, 600, 900, 1400];

function image(
    src: string,
    alt: string,
    opts: { eager?: boolean; sizes?: string; widths?: number[] } = {},
): Raw {
    const srcset = (opts.widths ?? FULL_WIDTHS).map((w) => `${sized(src, w)} ${w}w`).join(', ');
    const sizes = opts.sizes ?? '(max-width: 860px) 100vw, 33vw';
    return html`<img src="${raw(safeUrl(sized(src, 600)))}"
        srcset="${raw(srcset.split(', ').map(safeUrlPart).join(', '))}" sizes="${raw(sizes)}"
        alt="${alt}" width="1200" height="900"
        loading="${raw(opts.eager ? 'eager' : 'lazy')}" decoding="async"
        ${raw(opts.eager ? 'fetchpriority="high"' : '')}>`;
}

/** `<url> <descriptor>` — the URL is checked, the descriptor is ours. */
function safeUrlPart(entry: string): string {
    const [url, descriptor] = entry.split(' ');
    return `${safeUrl(url)} ${descriptor}`;
}

/**
 * The card's second line.
 *
 * Size and type moved up into the heading, because a grid where every card
 * says "Workshop" is a grid nobody can scan — 94 of the 198 buildings are
 * workshops, and without the size in the title the only thing distinguishing
 * six cards in a row is the photograph. What is left here is what actually
 * varies between two workshops of the same size: cladding, trim level, and
 * the one feature most likely to decide it.
 */
function cardFacets(b: Building): string {
    return [
        b.siding ? SIDING_LABELS[b.siding] : null,
        b.edition ? `${EDITION_LABELS[b.edition]} trim` : null,
        b.features.includes('Porch') ? 'Porch' : b.features.includes('Loft') ? 'Loft' : null,
    ].filter(Boolean).join(' · ') || `${b.size.width} ft wide`;
}

export function buildingCard(b: Building, opts: { eager?: boolean } = {}): Raw {
    // The data-* attributes are what the filter script reads. Putting the
    // facets in the markup keeps the filter working on the list the server
    // already sent, with no second copy of the catalogue shipped as JSON.
    return html`
<a class="card" href="/b/${raw(encodeURIComponent(b.id))}.html"
   data-type="${b.type}" data-width="${b.size.width}" data-length="${b.size.length}"
   data-sqft="${b.size.sqft}" data-price="${b.priceCents}"
   data-siding="${b.siding ?? ''}" data-edition="${b.edition ?? ''}"
   data-features="${b.features.join('|')}">
  <div class="card-shot">
    ${b.images[0] ? image(b.images[0], `${sizeLabel(b)} ${TYPE_LABELS[b.type]}`, { ...opts, widths: CARD_WIDTHS, sizes: '(max-width: 900px) 100vw, 340px' }) : raw('')}
  </div>
  <div class="card-body">
    <p class="card-meta"><span>${b.size.sqft} sq ft</span>${b.sidingColor ? html`<span>${b.sidingColor}</span>` : raw('')}</p>
    <h3 class="card-title">${sizeLabel(b)} ${TYPE_LABELS[b.type]}</h3>
    <p class="card-sum">${cardFacets(b)}</p>
    <p class="card-price">${formatPrice(b.priceCents)}</p>
  </div>
</a>`;
}

/**
 * The lead form, repeated on every building page and the contact page.
 *
 * A GET-able page with a POST form and no JavaScript dependency: it submits
 * to the function whether or not the script loaded. Nobody buys a $9,000
 * building from a form, so it asks for the minimum a callback needs and
 * nothing else — every extra field is a reason to close the tab.
 */
export function quoteForm(building: Building | null): Raw {
    return html`
<form class="quote" method="post" action="/api/quote">
  <h2>${building ? 'Ask about this building' : 'Ask us anything'}</h2>
  ${building ? html`<input type="hidden" name="buildingId" value="${building.id}">` : raw('')}
  ${building ? html`<p class="quote-ref">${sizeLabel(building)} ${TYPE_LABELS[building.type]} · ${formatPrice(building.priceCents)}</p>` : raw('')}
  <div class="hp" aria-hidden="true">
    <label>Company website<input name="company_website" tabindex="-1" autocomplete="off"></label>
  </div>
  <label>Your name<input name="name" required autocomplete="name" maxlength="120"></label>
  <label>Phone<input name="phone" type="tel" required autocomplete="tel" maxlength="40"></label>
  <label>Email<input name="email" type="email" required autocomplete="email" maxlength="254"></label>
  <label>Where is it going?<input name="zip" required autocomplete="postal-code" maxlength="12" placeholder="ZIP code"></label>
  <label>Anything we should know?<textarea name="note" rows="3" maxlength="1000"></textarea></label>
  <button type="submit">Request a callback</button>
  <p class="quote-note">We reply the same day, ${DEALER.hours.toLowerCase()}. No deposit taken here.</p>
</form>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export function buildingPage(b: Building, related: Building[]): string {
    const name = `${sizeLabel(b)} ${TYPE_LABELS[b.type]}${b.edition ? ` – ${EDITION_LABELS[b.edition]} Edition` : ''}`;
    const description = `${name} for sale — ${summaryLine(b)}. ${formatPrice(b.priceCents)}, delivered and set up by ${DEALER.name}.`;

    // Product schema so the price and availability can show in search results
    // directly. For a dealer competing with the manufacturer on the same
    // stock, the rich result is often the whole difference in click-through.
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        description,
        image: b.images.slice(0, 6),
        brand: { '@type': 'Brand', name: DEALER.supplier.name },
        sku: b.id,
        offers: {
            '@type': 'Offer',
            price: (b.priceCents / 100).toFixed(2),
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
            seller: { '@type': 'Organization', name: DEALER.name },
            url: `${DEALER.siteUrl}/b/${b.id}.html`,
        },
    };

    const body = html`
<main id="main">
  <nav class="crumbs wrap"><a href="/">Home</a> <span>/</span> <a href="/buildings.html">Buildings</a> <span>/</span> ${name}</nav>

  <article class="wrap building">
    <div class="building-shots">
      ${b.images.slice(0, 8).map((src, i) => html`<figure class="shot${raw(i === 0 ? ' shot-lead' : '')}">${image(src, `${name} — view ${i + 1}`, { eager: i === 0, sizes: i === 0 ? '(max-width: 900px) 100vw, 640px' : '(max-width: 900px) 50vw, 310px' })}</figure>`)}
    </div>

    <div class="building-side">
      <p class="eyebrow">In stock now</p>
      <h1>${name}</h1>
      <p class="lede">${summaryLine(b)}${b.sidingColor ? html` · ${b.sidingColor}` : raw('')}</p>
      <p class="big-price">${formatPrice(b.priceCents)}</p>
      <p class="price-note">Delivered and set up. ${b.size.sqft} sq ft of floor.</p>

      ${b.features.length ? html`<ul class="chips">${b.features.map((f) => html`<li>${f}</li>`)}</ul>` : raw('')}

      <a class="btn" href="#ask">Ask about this building</a>
      <a class="btn btn-quiet" href="${raw(telHref())}">Call ${DEALER.phone}</a>

      ${b.included.length ? html`
      <section class="spec-block">
        <h2>Already fitted to this one</h2>
        <ul class="spec-list">${b.included.map((s) => html`<li>${s}</li>`)}</ul>
      </section>` : raw('')}

      ${b.specs.length ? html`
      <section class="spec-block">
        <h2>Included in the price</h2>
        <ul class="spec-list">${b.specs.map((s) => html`<li>${s}</li>`)}</ul>
      </section>` : raw('')}

      ${b.colors.length ? html`
      <section class="spec-block">
        <h2>Colours on this building</h2>
        <dl class="colors">${b.colors.map((c) => html`<div><dt>${c.part}</dt><dd>${c.color}</dd></div>`)}</dl>
      </section>` : raw('')}
    </div>
  </article>

  <section class="wrap ask" id="ask">${quoteForm(b)}</section>

  ${related.length ? html`
  <section class="wrap band">
    <h2 class="band-title">Similar buildings in stock</h2>
    <div class="grid">${related.map((r) => buildingCard(r))}</div>
  </section>` : raw('')}
</main>`;

    return page({
        title: `${name} — ${formatPrice(b.priceCents)} | ${DEALER.name}`,
        description,
        path: `/b/${b.id}.html`,
        image: b.images[0],
        schema,
    }, body);
}

export function catalogPage(buildings: Building[], facets: CatalogFacets): string {
    const body = html`
<main id="main">
  <section class="wrap page-head">
    <p class="eyebrow">The lot</p>
    <h1>Buildings in stock.</h1>
    <p class="lede">Every building below is already built and ready to deliver. ${buildings.length} of them, priced as they stand.</p>
  </section>

  <div class="wrap catalog">
    <!--
      A <details> so that on a phone the filters collapse and the buildings
      are the first thing on screen. Shipped open, and closed again by the
      inline script below only when the viewport is small: that way the
      no-JavaScript case shows the filters expanded, which is cluttered but
      complete, rather than collapsed with no way to open them.
    -->
    <details class="filter-shell" open>
    <summary class="filter-toggle">Narrow it down<span class="filter-chevron" aria-hidden="true"></span></summary>
    <form class="filters" id="filters">
      <div class="filter-head">
        <h2>Narrow it down</h2>
        <button type="reset" class="link-btn">Clear</button>
      </div>

      <fieldset>
        <legend>What kind</legend>
        <div class="opts">
          ${facets.types.map((t) => html`<label><input type="checkbox" name="type" value="${t.value}"> ${t.label} <span class="n">${t.count}</span></label>`)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Width</legend>
        <div class="opts opts-row">
          ${facets.widths.map((w) => html`<label><input type="checkbox" name="width" value="${w}"> ${w} ft</label>`)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Budget</legend>
        <label class="range">Up to <output id="price-out">${formatPrice(facets.priceCents.max)}</output>
          <input type="range" id="price" name="price" min="${facets.priceCents.min}" max="${facets.priceCents.max}" value="${facets.priceCents.max}" step="10000">
        </label>
      </fieldset>

      ${facets.sidings.length ? html`
      <fieldset>
        <legend>Siding</legend>
        <div class="opts">
          ${facets.sidings.map(([value, count]) => html`<label><input type="checkbox" name="siding" value="${value}"> ${SIDING_LABELS[value]} <span class="n">${count}</span></label>`)}
        </div>
      </fieldset>` : raw('')}

      ${facets.features.length ? html`
      <fieldset>
        <legend>Must have</legend>
        <div class="opts">
          ${facets.features.slice(0, 8).map(([value, count]) => html`<label><input type="checkbox" name="feature" value="${value}"> ${value} <span class="n">${count}</span></label>`)}
        </div>
      </fieldset>` : raw('')}
    </form>
    </details>
    <script>
      // Inline and immediately after the element, so it runs before paint and
      // there is no flash of an open panel collapsing.
      if (window.matchMedia('(max-width: 860px)').matches) {
        document.currentScript.previousElementSibling.open = false;
      }
    </script>

    <div class="results">
      <div class="results-head">
        <p id="count" role="status" aria-live="polite">${buildings.length} buildings</p>
        <label class="sort">Sort
          <select id="sort">
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
            <option value="size-desc">Biggest first</option>
            <option value="size-asc">Smallest first</option>
          </select>
        </label>
      </div>
      <div class="grid" id="grid">${buildings.map((b, i) => buildingCard(b, { eager: i < 3 }))}</div>
      <p class="empty" id="empty" hidden>Nothing in stock matches that. <button type="button" class="link-btn" id="clear2">Clear the filters</button></p>
    </div>
  </div>
</main>`;

    return page({
        title: `Storage sheds, garages and workshops in stock | ${DEALER.name}`,
        description: `${buildings.length} Amish-built buildings in stock and ready to deliver, from ${formatPrice(facets.priceCents.min)}. Filter by size, style, siding and budget.`,
        path: '/buildings.html',
        image: buildings[0]?.images[0],
        script: '/filters.js',
    }, body);
}

export interface CatalogFacets {
    types: Array<{ value: Building['type']; count: number; label: string }>;
    widths: number[];
    sidings: Array<[NonNullable<Building['siding']>, number]>;
    features: Array<[string, number]>;
    priceCents: { min: number; max: number };
}

export function homePage(buildings: Building[], facets: CatalogFacets): string {
    const featured = pickFeatured(buildings);
    const cheapest = facets.priceCents.min;
    // The dealer's chosen hero, falling back to the automatic pick if that
    // building has sold and left the catalogue.
    const hero = buildings.find((b) => b.id === DEALER.heroBuildingId) ?? featured[0];

    const body = html`
<main id="main">
  <section class="hero">
    <div class="hero-shot">
      ${hero?.images[0] ? image(hero.images[0], `${sizeLabel(hero)} ${TYPE_LABELS[hero.type]}`, { eager: true, sizes: '100vw' }) : raw('')}
    </div>
    <div class="hero-veil"></div>
    <div class="wrap hero-inner">
      <p class="eyebrow">${DEALER.supplier.blurb}</p>
      <h1>Sheds that are already built.</h1>
      <p class="lede">No twelve-week wait and no configurator that ends in "call for pricing". ${buildings.length} buildings standing on the lot, every price on the page, delivered and set on your ground.</p>
      <div class="hero-actions">
        <a class="btn" href="/buildings.html">See what's in stock</a>
        <a class="btn btn-quiet" href="${raw(telHref())}">${DEALER.phone}</a>
      </div>
    </div>
  </section>

  <div class="wrap">
    <dl class="stats">
      <div><dt>In stock</dt><dd>${buildings.length}</dd></div>
      <div><dt>From</dt><dd>${formatPrice(cheapest)}</dd></div>
      <div><dt>Widths</dt><dd>${facets.widths[0]}–${facets.widths[facets.widths.length - 1]} ft</dd></div>
      <div><dt>Lead time</dt><dd>None</dd></div>
    </dl>
  </div>

  <section class="wrap band">
    <div class="band-head">
      <div><p class="eyebrow">The range</p><h2 class="band-title">Every kind we carry.</h2></div>
      <a class="link" href="/buildings.html">All ${buildings.length}</a>
    </div>
    <div class="types">
      ${facets.types.slice(0, 8).map((t) => html`
        <a class="type" href="/buildings.html#type=${raw(encodeURIComponent(t.value))}">
          <span class="type-name">${t.label}</span>
          <span class="type-n">${t.count} in stock</span>
        </a>`)}
    </div>
  </section>

  <section class="wrap band">
    <div class="band-head">
      <div><p class="eyebrow">Ready to deliver</p><h2 class="band-title">On the lot now.</h2></div>
      <a class="link" href="/buildings.html">See all</a>
    </div>
    <div class="grid">${featured.map((b) => buildingCard(b))}</div>
  </section>

  <section class="band-alt">
    <div class="wrap">
      <p class="eyebrow">The process</p>
      <h2 class="band-title">How buying one works.</h2>
      <ol class="steps">
        <li><span class="step-n">1</span><h3>Pick one that exists</h3><p>Everything on this site is a building standing on a lot, photographed as it is. What you see is the one that arrives.</p></li>
        <li><span class="step-n">2</span><h3>We check your ground</h3><p>A quick call about access and level. Most yards are fine; we tell you straight if yours needs blocks or stone first.</p></li>
        <li><span class="step-n">3</span><h3>Delivered and set</h3><p>It comes on a mule and is levelled in place. You do not need a foundation, a crane, or a day off.</p></li>
      </ol>
    </div>
  </section>

  <section class="wrap ask" id="ask">${quoteForm(null)}</section>
</main>`;

    return page({
        title: `${DEALER.name} — Amish-built sheds, garages and workshops in stock`,
        description: `${buildings.length} Amish-built buildings in stock and ready to deliver, from ${formatPrice(cheapest)}. Every price on the page.`,
        path: '/',
        image: hero?.images[0],
        bodyClass: 'home',
    }, body);
}

/**
 * Six buildings across six different types, cheapest first within each.
 *
 * Sorting the whole catalogue by price and taking the top six would show six
 * near-identical small workshops, since that is what the bottom of the price
 * list is. Spreading across types makes the homepage answer "what do you
 * sell" instead of "what is cheapest".
 */
export function pickFeatured(buildings: Building[], limit = 6): Building[] {
    const seen = new Set<string>();
    const picked: Building[] = [];
    // Mid-priced first: the cheapest of a type is usually its plainest, and a
    // homepage is a shop window.
    const byInterest = [...buildings].sort((a, b) => b.priceCents - a.priceCents);
    for (const b of byInterest) {
        if (seen.has(b.type)) continue;
        seen.add(b.type);
        picked.push(b);
        if (picked.length === limit) break;
    }
    return picked;
}

export function simplePage(opts: { title: string; description: string; path: string }, inner: Raw): string {
    return page(opts, html`<main id="main"><section class="wrap prose">${inner}</section></main>`);
}

export { join, esc };
