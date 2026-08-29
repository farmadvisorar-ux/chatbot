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
