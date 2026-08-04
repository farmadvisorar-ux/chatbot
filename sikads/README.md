# Sikads

Self-serve advertising. Anyone can submit a one-line pitch and a link, set
their **own price per 1,000 views**, and pay through Stripe Checkout. Paid
campaigns land in a review queue before they go live; approved campaigns
rotate in the homepage's Sponsored slot, weighted so a higher price rotates
more often, and stop automatically once their purchased views run out.
100% of every payment is platform revenue — there's no payout split.

## How it works

1. **Advertiser submits a pitch.** Homepage `#advertise` form: headline, link,
   email, price per 1,000 views ($1–$100), total budget ($5–$5,000). Views
   purchased = `budget / (cpm / 1000)`, shown live as they type.
2. **Stripe Checkout.** The full budget is charged as a single payment.
   `api/ads.ts` (`POST ?action=checkout`) creates the campaign as
   `awaiting_payment` and a Checkout Session.
3. **Webhook marks it paid.** `api/webhooks/stripe.ts` flips the campaign to
   `pending_review` on `checkout.session.completed`.
4. **You review it.** `/admin.html` (guarded by `ADMIN_SECRET`) lists
   campaigns awaiting review. Approve → `live`. Reject → `rejected`.
5. **It rotates.** Every homepage load calls `GET /api/ads`, which picks one
   live campaign (weighted by its price — see the comment in `api/ads.ts` for
   the algorithm) and decrements its `views_remaining` in the same atomic
   query. Hits zero → `exhausted`, and it stops serving on its own.

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL at minimum
npm run migrate         # applies db/schema.sql
npm run dev
```

Visit `http://localhost:5173` for the homepage and `/admin.html` for the
review queue. Without `STRIPE_SECRET_KEY` set, checkout reports "not open
yet" instead of crashing — useful for working on everything except payments.

## Deploying to sikads.com

1. Create a Postgres database (Vercel Postgres, Neon, or Supabase all work)
   and run `npm run migrate` against it once.
2. Create a Stripe account (or use an existing one), copy the **secret key**,
   and set up a webhook endpoint at `https://sikads.com/api/webhooks/stripe`
   listening for `checkout.session.completed` — copy its signing secret.
3. Deploy this directory (`/sikads`) as its own Vercel project (Root
   Directory = `sikads`). Set the env vars from `.env.example` in the Vercel
   project settings: `DATABASE_URL`, `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `PUBLIC_SITE_URL=https://sikads.com`, and a long
   random `ADMIN_SECRET`.
4. In the Vercel project's **Domains** settings, add `sikads.com` and point
   its DNS (A/CNAME, per Vercel's instructions) at Vercel from wherever the
   domain is registered.
5. Open `/admin.html` on the deployed site and sign in with `ADMIN_SECRET` to
   review the first campaigns as they come in.

## Adjusting the price floor/ceiling

`api/_lib/pricing.ts` holds the only server-enforced bounds:
`MIN_CPM_CENTS`/`MAX_CPM_CENTS` (price per 1,000 views) and
`MIN_BUDGET_CENTS`/`MAX_BUDGET_CENTS` (total spend). Change the constants
there and the matching `min`/`max` attributes on the form inputs in
`index.html` to move them.
