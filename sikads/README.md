# Sikads

A two-sided self-serve ad exchange.

- **Advertisers** write a one-line pitch, set **their own price per 1,000 views**
  ($1.00–$100.00), pick a budget, and pay once through Stripe Checkout.
- **Publishers** paste one line of HTML on a site they own and keep **40%** of
  whatever the advertiser paid, credited on every view their page serves.
- Sikads keeps the other 60%.

The differentiator is not the percentage — networks in this category pay
40–50% — it is that the rate is **public**. The board on the homepage shows
what each advertiser is actually paying, so a publisher can verify their 40%
against a real number. Most networks never disclose it.

## How a dollar moves

1. **Advertiser pays.** `POST /api/ads?action=checkout` validates the rate and
   budget against the bounds in `api/_lib/pricing.ts`, writes the campaign as
   `awaiting_payment`, and opens a Stripe Checkout Session for the full budget.
   Views owned = budget ÷ rate × 1000.
2. **Webhook confirms.** `api/webhooks/stripe.ts` flips the campaign to
   `pending_review` on `checkout.session.completed`. Paid is not live.
3. **A human reviews.** `/admin.html` → Campaigns. Approve → `live`.
4. **The board serves.** `GET /api/ads?slot=KEY` picks one live campaign
   weighted by its rate, spends exactly one view from its balance, and credits
   the publisher 40% of that campaign's rate — **all in a single SQL statement**,
   so a crash can never spend a view without paying for it or vice versa.
   A campaign hitting zero flips to `exhausted` and stops serving.
5. **You settle.** `/admin.html` → Publishers shows what each is owed. Send the
   money however you like, then "Mark as paid" to record it.

`GET /api/ads?view=board` is a separate read-only endpoint for the homepage
rate board. It deliberately does **not** spend a view — browsing sikads.com is
not an impression, and billing advertisers for it would burn budget on traffic
that never saw the ad in a slot.

## The publisher embed

`public/embed.js` is served statically and runs on third parties' sites:

```html
<div id="sikads"></div>
<script src="https://sikads.com/embed.js" data-slot="sk_..."></script>
```

It builds the ad with DOM calls rather than `innerHTML` (the headline is
advertiser-supplied text running inside someone else's page), makes no
third-party calls beyond fetching the ad, sets no cookies, and leaves the
container untouched if the request fails — a broken ad must never break a
publisher's page. `GET /api/ads` sends `Access-Control-Allow-Origin: *` so the
fetch works cross-origin.

The `slot_key` is public by design: it ships inside client-side markup, so it
authorises nothing on its own.

## Money representation

Earnings accrue in **microcents** (1 cent = 1,000 microcents). At a $5.00 rate
a single view earns a publisher 0.2 cents — integer cents would round that to
zero and lose every impression. Rounding to whole cents is deferred to payout.

## Local development

```bash
npm install
cp .env.example .env    # DATABASE_URL at minimum
npm run migrate         # applies db/schema.sql
npm run dev
```

`vite dev` serves the pages but not the `/api` functions, so the rate board
will report itself unreachable until deployed (or run under `vercel dev`).

## Deploying to sikads.com

1. **Database** — Neon, Vercel Postgres or Supabase. Run `npm run migrate`
   against it once.
2. **Vercel** — import the repo with **Root Directory** set to `sikads`.
3. **Stripe** — one **secret key**, plus a webhook endpoint at
   `https://<your-domain>/api/webhooks/stripe` subscribed to
   `checkout.session.completed`. An existing Stripe account is fine; only the
   webhook endpoint has to be new, since Stripe scopes signing secrets per URL.
4. **Env vars** — `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `ADMIN_SECRET` (any long random string), `PUBLIC_SITE_URL`.
5. **Domain** — add `sikads.com` in the Vercel project's Domains settings and
   point DNS at Vercel. Then set `PUBLIC_SITE_URL=https://sikads.com` and
   update the webhook URL to match.

## Changing the numbers

`api/_lib/pricing.ts` holds every figure the business runs on:
`MIN_CPM_CENTS` / `MAX_CPM_CENTS`, `MIN_BUDGET_CENTS` / `MAX_BUDGET_CENTS`, and
`PUBLISHER_SHARE_PERCENT`. The share is quoted verbatim on the landing page —
changing it changes a public promise, not just a constant, so update
`index.html` alongside it.

## What is not built yet

- **Publisher payouts are manual.** The ledger tracks what is owed; sending it
  is off-platform, and "Mark as paid" only records that you did. Stripe Connect
  would automate this.
- **No publisher dashboard.** Earnings are visible to the operator in
  `/admin.html` only. Exposing them to publishers needs real auth — the
  `slot_key` cannot serve as one, since it is public.
- **Impression fraud is only rate-limited.** An approved slot key looped
  against a page nobody visits will accrue earnings. The review step before a
  key goes active is currently the main defence.
