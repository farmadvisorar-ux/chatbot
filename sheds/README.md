# Dealer site

A storefront and information site for a dealer selling **Infinite Sheds**
buildings — built from the supplier's own live catalogue, and deliberately
faster and more shoppable than the supplier's site.

## Before this goes in front of anyone

`src/lib/dealer.ts` is entirely placeholders. Nothing on the site is wrong
except that every mention of the business is. Replace, in one file:

- `name`, `siteUrl`
- `phone`, `email` — the phone number is on every page and in every `tel:` link
- `address`, `territory`
- `MARKUP_PERCENT` — **currently 0**, so the supplier's own prices are shown
  unchanged. That is the only safe default; see *Pricing* below.

Then `npm run build`. The values are compiled into every page, so nothing is
live until a rebuild.

## Why this exists

The supplier's site works but is slow and cannot be filtered:

| | Supplier | This site |
|---|---|---|
| Homepage HTML | 844 KB | **11 KB** |
| A building's page | 677 KB | **11 KB** |
| Listing page | 517 KB, paginated | **141 KB, all 198 buildings** |
| Filter by size / style / siding / budget | no | yes, instant |
| JavaScript needed to see a price | yes | no |

The filtering is the substantive part, and it was not a design decision so
much as a data one.

## The problem the catalogue had

Every building's facts live inside its title, and the titles were typed by
hand over several years. Across 198 buildings there are **48 distinct style
strings** for about a dozen actual building types:

```
Workshop · Vinyl Workshop · Board & Batten Workshop · B&B Workshop
LP B&B Workshop · Lap Siding Workshop · Wood Workshop · Standard Workshop …
```

Three characters are used for the size separator (`x`, `×`), two for the name
separator (`-`, `–`), `Batton` appears for `Batten`, `Lapp` for `Lap`, and
siding is baked into the style name so "Vinyl Workshop" and "Workshop" sort as
different products. You cannot filter on a field that does not exist, which is
why the supplier's site offers only hand-curated collections.

`src/lib/normalize.ts` pulls that prose apart into real fields — size, type,
trim level, siding, colour, features — and everything else follows from it.

## Layout

```
data/supplier-snapshot.json   the supplier's feed, committed
data/catalog.json             normalized, generated, committed
src/lib/normalize.ts          the parser — the heart of this
src/lib/dealer.ts             everything about this dealer  ← edit this
src/lib/templates.ts          every page, as functions
src/lib/html.ts               escaping-by-default templating
scripts/build-catalog.mjs     snapshot → catalog.json
scripts/generate-site.mjs     catalog.json → dist/
api/quote.ts                  lead capture
```

Both data files are committed on purpose: the diff on a refresh is the record
of what the supplier changed — what sold, what arrived, which prices moved.

## Commands

```bash
npm install
npm run build       # catalog + site into dist/
npm run dev         # build, then serve dist/ on :4321
npm test            # 37 tests, including the parser against all 198 buildings
npm run typecheck
npm run catalog -- --fetch   # pull a fresh snapshot from the supplier first
```

There is no bundler. The site is HTML, one stylesheet and one 4 KB script; a
build step that only concatenates and copies cannot quietly add 200 KB of
runtime.

## Refreshing stock

```bash
npm run catalog -- --fetch && npm run build
```

This reads the supplier's public Shopify product feed — the same catalogue
data their storefront serves any browser. Their `robots.txt` permits crawling
and forbids automated checkout, which this does not go near. A feed that comes
back empty is refused rather than allowed to overwrite a good snapshot.

Run it weekly. Buildings that sell stay on the site until you do, and a
customer driving out for a building that is gone is the worst failure this
site has.

## Things to decide before launch

**Pricing.** The prices are the supplier's, shown unchanged. If the dealer
sells at a different price, set `MARKUP_PERCENT` — every page shows the
adjusted figure after a rebuild. Leaving it at 0 is honest but may be wrong
for the business.

**Photographs.** Images are hotlinked from the supplier's Shopify CDN. That
works today and costs nothing, but the dealer does not control those URLs: if
the supplier removes a building, its photographs disappear from this site
mid-visit. Confirm the dealer is licensed to use them, then mirror them.

**Stock is the supplier's, not the dealer's.** Every building here is a real
unit standing on the supplier's lot, and another dealer can sell the same one.
"In stock now" on each page is true of the supplier's inventory at the time of
the last refresh — worth confirming before promising a specific building.

## What is not built

- **No payments.** The forms request a callback. Nobody buys a $9,000 building
  from a web form, and a deposit flow is worth adding only once the dealer
  knows what deposit they want to take.
- **No admin screen.** Leads go to Postgres if `DATABASE_URL` is set, and to
  the function log if it is not, so nothing is lost before the database
  exists. Reading them currently means querying the table.
- **No email on a new lead.** The dealer has to look. This is the first thing
  to add.
