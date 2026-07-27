# FreshSAAS

A launch directory and marketplace for newly launched SaaS products, built as a static Vite frontend with Vercel serverless functions and Postgres.

## Stack

- Frontend: Vite + TypeScript, no framework, Tailwind for base styles
- Backend: Vercel serverless functions in `api/`
- Database: any Postgres (Vercel Postgres, Neon, Supabase, etc.) via `DATABASE_URL`

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL
npm run migrate        # creates tables
npm run dev             # frontend only, at http://localhost:5173
```

The dev server only serves the static frontend — API routes need either `vercel dev` (recommended, requires the Vercel CLI: `npm i -g vercel`) or a deployed preview to exercise `/api/*`.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the Vercel dashboard, "Add New Project" and import the repo. Vercel auto-detects the Vite build (`npm run build`, output `dist`) and the `api/` functions.
3. Provision a Postgres database (Vercel Postgres, or the Neon/Supabase integration from the Vercel marketplace) and copy its connection string.
4. In Project Settings → Environment Variables, add `DATABASE_URL` with that connection string.
5. Run the migration once against that database: `DATABASE_URL=... npm run migrate` (from your machine, or any environment with network access to the DB).
6. Deploy. `vercel.json` sets baseline security headers (CSP, X-Frame-Options, etc.).

## What's implemented vs. stubbed

- Waitlist signups, founder "submit your SaaS" form, and the Construction & Contractor OS demo are fully functional against Postgres, with per-IP rate limiting and server-side validation.
- The **Marketplace** (`#marketplace`) lets sellers submit a listing (held for manual review before going live) and lets buyers walk through a checkout that shows the 10% FreshSAAS platform fee / 90% seller payout split. **No payment processor is connected** — "Buy" records a demo order in `marketplace_orders` with status `stub_pending_payment_integration` and does not move real money. To accept real payments, wire `api/marketplace-orders.ts` to Stripe Connect (or similar) for seller onboarding, checkout, and payouts before going live with real transactions.
- There is no listing-approval admin UI yet — approve a listing by updating its `status` to `'live'` directly in `marketplace_listings` until one is built.

## Security notes

- All API input is validated and length-capped server-side; SQL uses parameterized queries throughout.
- `escapeHtml` is applied everywhere user- or catalog-supplied text is inserted via `innerHTML`.
- Rate limiting is best-effort and IP-based (stored in Postgres, since serverless functions share no memory) — add a CAPTCHA or auth layer if abuse becomes a problem at scale.
