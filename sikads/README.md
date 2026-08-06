# Sikads

**An ad exchange whose entire inventory is the seconds a model spends thinking.**

Every AI answer opens with a wait — a thinking indicator someone is watching
and nothing else. Sikads sells that moment.

- **Advertisers** write a one-line pitch, set **their own price per 1,000 views**
  ($1.00–$100.00), pick a budget, and pay once through Stripe Checkout.
- **AI apps** (chat wrappers, browser extensions, agent runners) drop one line
  of HTML into their loading state and keep **40%** of whatever the advertiser
  paid, credited on every view they serve.
- Sikads keeps the other 60%.

The differentiator is not the percentage — networks in this category pay
40–50% — it is that the rate is **public**. The board on the homepage shows
what each advertiser is actually paying, so an app can verify its 40% against
a real number. Most networks never disclose it.

Throughout the code and this document, "publisher" means the app showing the
ad. The database table is `publishers` for that reason.

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
npm test                # the payment arithmetic
```

`vite dev` serves the pages but not the `/api` functions, so the rate board
will report itself unreachable until deployed (or run under `vercel dev`).

TLS is detected from the connection string, so a Postgres running on your own
machine needs no extra flags. If `npm run migrate` hangs, see Troubleshooting
below — `npm run migrate:http` is the fallback for a blocked port 5432.

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

## Troubleshooting a deployment

The API tells you which setup step is missing rather than failing generically.
Hit `/api/ads?view=board` and match the response:

| Response | What it means | Fix |
|---|---|---|
| `{"rates":[…]}` | Working. | — |
| `{"rates":[],"configured":false}` | No connection string is visible to the functions. | Set `DATABASE_URL` (or any alias below) with **Production** ticked, then **redeploy** — Vercel bakes env vars in at build time, so setting one does nothing to an existing deployment. |
| `The database is connected but empty…` | Connected; the schema was never applied. | `npm run migrate` |
| `The database rejected this deployment's credentials…` | The connection string is set but wrong. | Re-copy it from the database provider. |
| `The database is unreachable…` | Network or a dead host. | Check the database is running and not IP-restricted. |
| `Admin access is not configured` | `ADMIN_SECRET` is unset. | Set it, tick **Production**, redeploy. |
| `Stripe webhook is not configured` | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` unset. | Expected until you wire up payments. |

Accepted connection-string variables, in order — attaching Neon from the
Vercel marketplace sets several of these at once, and any will do:

```
DATABASE_URL  POSTGRES_URL  POSTGRES_PRISMA_URL
DATABASE_URL_UNPOOLED  POSTGRES_URL_NON_POOLING
```

**If `npm run migrate` hangs or is refused**, port 5432 is blocked on your
network. Use `npm run migrate:http` instead — same schema, applied over Neon's
HTTPS endpoint.

**A variable that will not take effect** is almost always one of two things:
it was saved without the **Production** environment ticked, or no deployment
has been created since it was saved. Integrations like Neon set all
environments automatically; a hand-added variable does not.

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
