# live-store

The storefront that is actually live at tooiicy.com, plus a working PayPal checkout.

## Why this exists separately from `tooiicy/`

`tooiicy/` is the full Vite + Postgres + Printful storefront. It has never been
deployed — the Vercel project's Root Directory is set to `tooiicy/dist` (a build
output directory, not a project), so every one of its routes 404s in production.

What is actually serving on tooiicy.com is a hand-authored single-file page that
was deployed straight to Vercel and never committed anywhere. Its Checkout
button set `href` to `CHECKOUT_URL = "https://tooiicy.com"` — the homepage — so
checking out just reopened the store. Nothing took payment.

This package fixes that without waiting on the larger migration.

## How the build works

`build.mjs` fetches that page from the **immutable per-deployment URL** of the
build that produced it, then applies a fixed set of patches. It is pinned to the
per-deployment URL rather than tooiicy.com on purpose: once this deploys to the
apex domain, fetching tooiicy.com would fetch this build's own output.

Every patch asserts that it matched. If the upstream page changes shape, the
build fails loudly rather than silently shipping the unpatched Checkout button.

Patches applied:

1. Remove the pre-order option and its explainer (see below).
2. Remove the now-dead pre-order note toggle.
3. Point the Checkout button at `#` instead of the homepage.
4. Expose `render()` so the confirmation handler can empty the cart.
5. Inject the checkout + return-from-PayPal script.

## Checkout

- `POST /api/checkout { items: [{ size, qty }] }` -> `{ url }`
  Prices the cart **server-side** (`PRICE_CENTS`), opens a PayPal order, and
  returns the approval URL. Prices in the request are ignored: the page is
  static and anyone can edit what it posts.
- `POST /api/capture { paypalOrderId }` -> `{ status }`
  Runs when PayPal redirects the buyer back. Treats `ORDER_ALREADY_CAPTURED` as
  success so a reloaded return URL never pushes someone to pay twice.

Live mode unless `PAYPAL_MODE=sandbox`. Requires `PAYPAL_CLIENT_ID` and
`PAYPAL_CLIENT_SECRET`; `PUBLIC_SITE_URL` optionally overrides the return URL.

## Pre-orders are off

The page offered "$20 down, $15 due when it's ready", but nothing was ever built
to collect that $15. Rather than take deposits against a promise with no
mechanism behind it, the option is removed from the page and rejected by the
API. Re-enabling it needs a real balance-collection flow first.

## Orders are not stored

There is no database here. PayPal is the system of record — each order carries
the product, size and quantity as line items, plus the buyer's shipping address.
Fulfillment is manual from the PayPal dashboard. The `tooiicy/` app is where
order storage and Printful automation live, once it is deployed.

## Share previews, search, and Google Shopping

The page shipped `og:image="/tee.jpg"` — a relative URL. Facebook, iMessage,
WhatsApp, Slack and Gmail all require an absolute one and silently drop a
relative path, so shared links arrived with no picture. Every URL in the head
is now absolute and points at `https://www.tooiicy.com` (the apex 308-redirects
to www, and a crawler that has to follow a redirect to reach an image will
often drop it).

The build emits:

- `og-image.jpg` — a 1200x630 share card, composed by `sharp` from the product
  photo on the site's own `--panel` background. Wordless on purpose: text needs
  fonts the build container is not guaranteed to have, and the title and price
  already travel in the `og:` tags.
- `robots.txt` and `sitemap.xml`.
- `feed.xml` — a Google Merchant Center feed, one entry per size.

Plus `twitter:` card tags, a canonical link, and `Product` JSON-LD with an
offer per size, which is what Google reads for rich results and free Shopping
listings.

`og:description` and the meta description both still advertised the $20
pre-order; they now describe what is actually for sale.

### Listing on Google Shopping

The feed is generated but nothing is listed until someone connects it:

1. Create a Merchant Center account and verify + claim `tooiicy.com`.
2. Add a scheduled feed pointing at `https://www.tooiicy.com/feed.xml`.
3. Configure shipping rates and a returns policy — Merchant Center rejects
   products without them.
4. Opt in to free listings, and to Shopping ads if they are wanted.

The product photo is the weak point. Google wants at least 250x250 for apparel
and recommends 800x800 or better; `tee.jpg` is 340x353, so it will pass review
but look poor beside competitors. A larger original fixes this and the share
card at the same time.

## Search engine submission

`build.mjs` writes an IndexNow key file to the domain root. Bing, Yandex,
Seznam and Naver accept pushed URL notifications with no account — ownership is
proved by that key being readable at the root — so URLs are submitted with a
plain POST to `api.indexnow.org`. The key is hardcoded rather than generated
per build; regenerating it would invalidate the one already registered.

Google does not participate in IndexNow, and it removed its own
unauthenticated sitemap ping endpoint in 2023 (it now 404s). That leaves two
routes, and only the first works without a login:

1. The `Sitemap:` line in `robots.txt`, which Google reads when it crawls.
   Already in place — this is passive discovery, not a submission.
2. Search Console, which requires a signed-in Google account. Verify the
   domain, then submit `sitemap.xml` under Indexing → Sitemaps. This is the
   one that gets the site indexed promptly, and it cannot be automated from
   here.
