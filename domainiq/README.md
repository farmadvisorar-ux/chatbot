# DomainIQ

A free, transparent domain-name valuation platform. Instant, fully explained
estimates — multi-factor scoring across length, word composition,
brandability, TLD authority, keyword commercial demand and real comparable
sales — with accounts, watchlists, bulk/portfolio checking, and a
compare tool. No email wall on the valuation itself.

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
- **Database:** SQLite via `better-sqlite3` — a single file, zero external
  services to provision
- **Auth:** Hand-rolled email+password with bcrypt hashing and signed JWT
  session cookies (`jose`) — no third-party auth vendor required
- **Email:** [Resend](https://resend.com) if `RESEND_API_KEY` is set;
  otherwise verification/reset emails are captured at `/dev/emails` so the
  whole signup flow is testable with zero paid services
- **Monetization:** ad placeholder slots + affiliate "list your domain"
  links to domain marketplaces (Sedo, Afternic, Dan.com) — no subscription,
  no paywall

## Local setup

```bash
npm install
cp .env.example .env      # set AUTH_SECRET to a random string (openssl rand -base64 32)
npm run seed               # creates data/domainiq.sqlite and loads comparable sales
npm run dev                 # http://localhost:3000
```

Everything works out of the box with no external accounts:
- Auth: fully self-contained (bcrypt + JWT cookies).
- Email: without `RESEND_API_KEY`, verification/reset links are logged to
  the console and viewable at `/dev/emails`.
- Domain age lookup: best-effort via public RDAP; silently omitted if the
  network call fails or times out.

## Project structure

```
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
    db.ts               # SQLite connection + schema bootstrap
    mailer.ts           # pluggable email sending (Resend or dev outbox)
  app/
    page.tsx                    # landing + instant checker
    valuation/[domain]/page.tsx  # full valuation report
    compare/, bulk/              # comparison & portfolio tools
    dashboard/                   # watchlist with price-change tracking
    signup/, login/, forgot-password/, reset-password/, verify-email/
    api/                         # JSON API + auth endpoints
scripts/
  seed-data.ts   # curated comparable domain sales
  seed.ts        # loads seed-data.ts into the database
data/wordlist.txt  # ~63k-word English dictionary (from Debian's wamerican package)
```

## Deploying

This app persists data to a local SQLite file, so it needs a host with a
**writable, persistent disk** — e.g. a small VPS, Render, Fly.io, or Railway
running `npm run build && npm run start`. It is *not* a drop-in fit for
Vercel/serverless hosting, whose filesystem is ephemeral/read-only per
invocation; to deploy there, swap `src/lib/db.ts` for a hosted database
(Postgres, Turso/libSQL, etc.) first.

Set these environment variables in production:
- `AUTH_SECRET` — long random string
- `DATABASE_PATH` — path to a persistent volume
- `RESEND_API_KEY` / `EMAIL_FROM` — for real email delivery
- `NEXT_PUBLIC_BASE_URL` — your production URL (used in email links)

Run `npm run seed` once against the production database to load the
comparable-sales dataset.

## Methodology & data honesty

Comparable sale prices in `scripts/seed-data.ts` are compiled from public
press coverage of domain-industry trade press and mainstream tech/business
reporting; treat them as approximate, directional reference points, not
verified transaction records — this is disclosed on every report. All
valuations are algorithmic estimates for informational purposes, not formal
appraisals or guarantees of sale price.
