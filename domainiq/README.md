# DomainIQ

A free, transparent domain-name valuation platform. Instant, fully explained
estimates — multi-factor scoring across length, word composition,
brandability, TLD authority, keyword commercial demand and real comparable
sales — with accounts, watchlists, bulk/portfolio checking, and a
compare tool. No email wall on the valuation itself.

**Deployable to Vercel** using Postgres (Vercel Postgres, the Neon
integration, Supabase, or any Postgres host) — see [Deploying to
Vercel](#deploying-to-vercel) below.

## Why this is different from typical "domain appraisal" tools

- **Explainable, not a black box.** Every report shows the full factor
  breakdown with scores and plain-language reasoning — see
  `/how-it-works` for the full methodology.
- **Anchored to real comps.** A curated dataset of publicly reported
  domain sales (`scripts/seed-data.ts`) is matched by extension/category/length
  and blended into the estimate, with the blend weight and confidence shown.
- **No paid third-party APIs required.** The whole valuation engine runs
  locally against an embedded 63k-word English dictionary and hand-curated
  keyword/TLD tables — nothing to configure, no usage costs, no external
  outage risk. An optional public RDAP lookup adds a domain-age signal when
  the network allows it, and degrades gracefully when it doesn't.
- **No email-gated results.** Get the full report immediately. Sign up only
  if you want to save domains, track price history, or check in bulk.

## Stack

- **Framework:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database:** Postgres via `pg` — Vercel Postgres, Neon, Supabase, or any
  Postgres host
- **Auth:** Hand-rolled email+password with bcrypt hashing and signed JWT
  session cookies (`jose`) — no third-party auth vendor required
- **Email:** [Resend](https://resend.com) if `RESEND_API_KEY` is set;
  otherwise verification/reset emails are captured at `/dev/emails` so the
  whole signup flow is testable with zero paid services
- **Monetization:** ad placeholder slots + affiliate "list your domain"
  links to domain marketplaces (Sedo, Afternic, Dan.com) — no subscription,
  no paywall

## Local setup

You need a Postgres database to point at. Easiest options: a free
[Neon](https://neon.tech) project, Docker (`docker run -p 5432:5432 -e
POSTGRES_PASSWORD=postgres postgres`), or a local Postgres install.

```bash
npm install
cp .env.example .env      # set AUTH_SECRET (openssl rand -base64 32) and DATABASE_URL
npm run migrate            # creates tables in DATABASE_URL
npm run seed                # loads the comparable-sales dataset
npm run dev                  # http://localhost:3000
```

Everything else works out of the box with no external accounts:
- Auth: fully self-contained (bcrypt + JWT cookies).
- Email: without `RESEND_API_KEY`, verification/reset links are logged to
  the console and viewable at `/dev/emails`.
- Domain age lookup: best-effort via public RDAP; silently omitted if the
  network call fails or times out.

## Project structure

```
db/
  schema.sql       # Postgres schema, applied by scripts/migrate*.mjs
src/
  lib/
    valuation/
      engine.ts       # orchestrates the whole scoring pipeline
      tld-table.ts    # TLD authority scores + price multipliers
      keywords.ts      # commercial-intent keyword tiers
      dictionary.ts    # dictionary word-segmentation (uses data/wordlist.txt)
      linguistics.ts   # brandability/pronounceability + length scoring
      comps.ts         # comparable-sales similarity matching
      rdap.ts           # optional domain-age lookup
    auth.ts            # sessions, password hashing, email tokens
    db.ts               # Postgres pool (pg)
    mailer.ts           # pluggable email sending (Resend or dev outbox)
  app/
    page.tsx                    # landing + instant checker
    valuation/[domain]/page.tsx  # full valuation report
    compare/, bulk/              # comparison & portfolio tools
    dashboard/                   # watchlist with price-change tracking
    signup/, login/, forgot-password/, reset-password/, verify-email/
    api/                         # JSON API + auth endpoints
scripts/
  migrate.mjs       # applies db/schema.sql over a direct TCP connection
  migrate-http.mjs  # applies db/schema.sql over Neon's HTTP driver (for
                     # sandboxes/CI runners with no outbound TCP access)
  seed-data.ts      # curated comparable domain sales
  seed.ts           # loads seed-data.ts into the database
src/data/wordlist.txt  # ~63k-word English dictionary (from Debian's wamerican package)
```

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the
   repo — `domainiq/` is a subdirectory of a larger repo, so when importing
   in Vercel set **Root Directory** to `domainiq`).
2. In the [Vercel dashboard](https://vercel.com/new), "Add New Project" and
   import the repo. Vercel auto-detects Next.js (`npm run build`).
3. Provision a Postgres database — the **Neon** integration from the Vercel
   Marketplace is the easiest (free tier available), or use Vercel Postgres,
   Supabase, etc. Copy its connection string.
4. In Project Settings → Environment Variables, add:
   - `DATABASE_URL` — the Postgres connection string from step 3
   - `AUTH_SECRET` — a long random string (`openssl rand -base64 32`)
   - `NEXT_PUBLIC_BASE_URL` — your production URL, e.g. `https://domainiq.vercel.app`
   - `RESEND_API_KEY` / `EMAIL_FROM` — optional, for real email delivery
     (see below)
5. Run the schema migration once against that database:
   `DATABASE_URL=... npm run migrate` from your machine, or any environment
   with raw Postgres/TCP access. **From a sandboxed environment that only
   allows outbound HTTPS** (no port-5432 access — common in CI runners and
   hosted coding agents), use `DATABASE_URL=... npm run migrate:http`
   instead, which applies the same `db/schema.sql` over Neon's HTTP driver
   (Neon databases only — other Postgres providers need `npm run migrate`
   from a TCP-capable environment).
6. Run `DATABASE_URL=... npm run seed` once to load the comparable-sales
   dataset.
7. Deploy. **Redeploy after adding/changing any env var** — Vercel bakes
   them into the deployment at build time.

### Setting up real email delivery (optional)

1. Create a free account at [resend.com](https://resend.com) and copy an
   API key from **API Keys**.
2. Set it as `RESEND_API_KEY` in Vercel and redeploy.
3. **Sandbox limitation:** without a verified sending domain, Resend's
   default `onboarding@resend.dev` sender can only deliver to the email
   address on your own Resend account. To send to anyone, add a domain you
   own under Resend → **Domains**, verify it via DNS, and update
   `EMAIL_FROM` to an address on that domain.

Without `RESEND_API_KEY` set, the app still works end-to-end — verification
and password-reset links are logged to the server console and viewable at
`/dev/emails` instead of emailed.

## Methodology & data honesty

Comparable sale prices in `scripts/seed-data.ts` are compiled from public
press coverage of domain-industry trade press and mainstream tech/business
reporting; treat them as approximate, directional reference points, not
verified transaction records — this is disclosed on every report. All
valuations are algorithmic estimates for informational purposes, not formal
appraisals or guarantees of sale price.
