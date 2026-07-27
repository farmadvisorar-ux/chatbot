# FreshSAAS

A launch directory and marketplace for newly launched SaaS products, built as a static Vite frontend with Vercel serverless functions and Postgres.

**Live:** https://freshsaas.vercel.app (Vercel project `wordwide-top-10/freshsaas`, database via the Neon Vercel integration).

## Stack

- Frontend: Vite + TypeScript, no framework, Tailwind for base styles
- Backend: Vercel serverless functions in `api/`
- Database: any Postgres (Vercel Postgres, Neon, Supabase, etc.) via `DATABASE_URL`
- Auth: [Clerk](https://clerk.com) — Google, Microsoft, email+password, email magic link, one unified sign-in used site-wide
- Transactional email: [Resend](https://resend.com) — welcome email on signup

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
5. Run the migration once against that database: `DATABASE_URL=... npm run migrate` (from your machine, or any environment with raw Postgres/TCP network access to the DB). If you're running from a sandboxed environment that only allows outbound HTTPS (no direct port-5432 access — common in CI runners and hosted agents), use `DATABASE_URL=... npm run migrate:http` instead, which applies the same `db/schema.sql` over Neon's HTTP driver. This only works against Neon databases; other Postgres providers need the plain `npm run migrate` from an environment with TCP access.
6. Deploy. `vercel.json` sets baseline security headers (CSP, X-Frame-Options, etc.). **Redeploy after adding/changing any env var** — Vercel bakes them into a deployment at build time (this matters even more for `VITE_CLERK_PUBLISHABLE_KEY`, since Vite inlines `VITE_*` vars into the JS bundle at build time — if it's unset during `npm run build`, the entire Clerk integration is dead-code-eliminated from the bundle, not just left broken).

## Setting up sign-in (Clerk)

1. Create a free account at https://clerk.com and a new Application.
2. In the Application's sign-in options, enable: **Email address** (with both "Password" and "Email verification link" / magic link strategies), **Google**, and **Microsoft**. Clerk provides shared development OAuth credentials for Google out of the box; Microsoft and production Google both need your own OAuth app (Clerk's dashboard walks you through registering one in Google Cloud Console / Azure AD when you're ready to go to production — you can launch with Clerk's dev credentials first).
3. In **API Keys**, copy the **Publishable key** and **Secret key**.
4. Set both as Vercel env vars: `VITE_CLERK_PUBLISHABLE_KEY` (Publishable key) and `CLERK_SECRET_KEY` (Secret key), then redeploy (step 6 above — the publishable key must be present at build time).
5. Once deployed, go to Clerk Dashboard → **Webhooks** → **Add Endpoint**, URL `https://<your-domain>/api/webhooks/clerk`, subscribed to the `user.created` and `user.updated` events. Copy the endpoint's **Signing Secret** and set it as `CLERK_WEBHOOK_SECRET` in Vercel, then redeploy once more.

Without these env vars set, the site still works — the "Sign in" control just hides itself, and any auth-gated API endpoint returns a clear 501 instead of crashing.

## Setting up the welcome email (Resend)

1. Create a free account at https://resend.com and copy an API key from **API Keys**.
2. Set it as `RESEND_API_KEY` in Vercel and redeploy.
3. **Sandbox limitation:** without a verified sending domain, Resend's default `onboarding@resend.dev` sender can only deliver to the email address on your own Resend account — real signups won't receive the welcome email yet. To send to anyone, add a domain you own under Resend → **Domains**, verify it via the DNS records Resend gives you, and update the `SENDER` constant in `api/_lib/email.ts` to an address on that domain (e.g. `FreshSAAS <hello@yourdomain.com>`).

## What's implemented vs. stubbed

- Waitlist signups, founder "submit your SaaS" form, and the Construction & Contractor OS demo are fully functional against Postgres, with per-IP rate limiting and server-side validation.
- Sign-in (Clerk) is wired site-wide and required before submitting or buying a marketplace listing; the same account works everywhere on the site.
- The **Marketplace** (`#marketplace`) lets signed-in sellers submit a listing (held for manual review before going live) and lets signed-in buyers walk through a checkout that shows the 10% FreshSAAS platform fee / 90% seller payout split. **No payment processor is connected** — "Buy" records a demo order in `marketplace_orders` with status `stub_pending_payment_integration` and does not move real money. To accept real payments, wire `api/marketplace-orders.ts` to Stripe Connect (or similar) for seller onboarding, checkout, and payouts before going live with real transactions.
- There is no listing-approval admin UI yet — approve a listing by updating its `status` to `'live'` directly in `marketplace_listings` until one is built.
- The welcome email fires off the Clerk `user.created` webhook — see the Resend sandbox limitation above for what "real" delivery requires.

## Security notes

- All API input is validated and length-capped server-side; SQL uses parameterized queries throughout.
- `escapeHtml` is applied everywhere user- or catalog-supplied text is inserted via `innerHTML`.
- Rate limiting is best-effort and IP-based (stored in Postgres, since serverless functions share no memory) — add a CAPTCHA if abuse becomes a problem at scale.
- Marketplace listing/order identity (seller/buyer email, user id) is derived server-side from a verified Clerk session token, never trusted from client-supplied form fields.
- Clerk's SDK (~1MB gzipped) is lazy-loaded on first sign-in interaction via a dynamic `import()` in `src/auth.ts`, so it doesn't add to the initial page load for visitors who never sign in.
