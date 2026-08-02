# DAREALTYTE

Wayback Machine recovery + one-click Vercel deployment engine.

Given a domain, this pulls the most recent (or a specific) historical
snapshot from the [Internet Archive Wayback Machine](https://web.archive.org),
strips out the injected Wayback toolbar and a small blocklist of known spam
link patterns, rewrites archived asset URLs back to their original form, and
optionally deploys the result live as a Vercel production deployment —
useful for reclaiming the content of an expired domain you now own.

## ⚠️ Read this before relying on `/api/recover` or `/api/launch`

This repo's other project, `wayback-downloader/`, already built a very
similar tool and documented a hard-won finding in its README:

> requests to `web.archive.org` from serverless/datacenter IP ranges
> (Vercel's included) were silently dropped or reset — not fixed by adding
> a `User-Agent` header or retrying. This is very likely a form of
> anti-bot/anti-scraping protection that treats cloud infrastructure
> differently from an ordinary visitor's browser.

`api/recover.ts` and `api/launch.ts` in this project make exactly that kind
of request — a server-side `fetch()` to `web.archive.org` — which is the
one thing `wayback-downloader` deliberately avoids by doing all Wayback
fetches client-side in the visitor's browser instead.

**Before depending on this in production**, deploy it and test a real
`/api/recover` call against your actual host (Vercel serverless functions
and most VPS/PaaS providers all sit on datacenter IP ranges). If archive.org
starts silently dropping or resetting those requests the way it did for
`wayback-downloader`, the fix is architectural, not a header tweak:
move the Wayback fetch itself to the browser (like `wayback-downloader`
does) and have the client submit the already-fetched HTML to `/api/launch`
for sanitization + deployment instead of having the server fetch it.

## Auth model

Access is a real account, not a shared secret: sign-in is handled by
[Clerk](https://clerk.com), and `/api/recover`, `/api/launch`,
`/api/map-domain`, and `/api/verify-dns` all require a valid Clerk session
**and** unexpired paid access (`/api/account-status` and `/api/checkout`
only require the session — that's how you get access in the first place).

Paid access is a one-time $18 Stripe payment (`/api/checkout` →
`/api/webhooks/stripe`) that grants 6 months of access, stamped onto the
user's Clerk `privateMetadata.accessExpiresAt` — there's no subscription and
no auto-renewal. Every route fails closed (HTTP 501) if Clerk/Stripe aren't
configured, and 401/402 if the caller isn't signed in or hasn't paid — no
"open by accident" state. This matters because every route here spends real
quota/money on the caller's behalf (Wayback fetches, Vercel deployments,
domain attachments, Stripe transactions).

### `POST /api/recover`

Fetch + sanitize a snapshot without deploying it. Useful for previewing.

```json
{ "domain": "oldhairwebsite.com", "timestamp": "20210101000000" }
```

`timestamp` is optional (defaults to `20210101000000`, matching the
Wayback Machine's own "nearest available" behavior).

### `POST /api/launch`

Fetch + sanitize + deploy to Vercel as a new production deployment.

```json
{ "domain": "oldhairwebsite.com", "timestamp": "20210101000000" }
```

Response includes `projectId`, `deployment_id`, and `preview_url`
(the `*.vercel.app` URL of the new deployment).

### `POST /api/map-domain`

Attach a custom domain to the project created by `/api/launch`.

```json
{ "projectId": "dareal-oldhairwebsite-com", "customDomain": "mybrandnewdomain.com" }
```

### `POST /api/verify-dns`

Poll Vercel to check whether a mapped domain's DNS is correctly configured.

```json
{ "projectId": "dareal-oldhairwebsite-com", "customDomain": "mybrandnewdomain.com" }
```

### `GET /api/account-status`

Returns `{ email, paid, accessExpiresAt }` for the signed-in caller. Requires
a session but not paid access — the console uses this to decide whether to
show the paywall.

### `POST /api/checkout`

Creates a Stripe Checkout session for the $18 one-time payment and returns
`{ url }` to redirect the browser to. Requires a session but not paid access.

### `POST /api/webhooks/stripe`

Stripe webhook target. On `checkout.session.completed` with
`payment_status: "paid"`, stamps the paying user's Clerk account with 6
months of access. Not meant to be called directly — point Stripe's webhook
settings at this URL.

## What the sanitizer actually does — and doesn't

`api/_lib/sanitize.ts` is a **best-effort cleanup pass, not a security
scanner**:

- Removes the Wayback Machine's own injected toolbar (`#wm-ipp-base`,
  `#wm-ipp`, `.wm-ab`, the `BEGIN/END WAYBACK TOOLBAR INSERT` comment block,
  and any `<script>`/`<link>` still pointing at `archive.org`).
- Rewrites archived absolute URLs (`https://web.archive.org/web/<ts>id_/...`)
  in `href`, `src`, and `srcset` back to the original host, so the deployed
  page doesn't depend on archive.org staying up.
- Neutralizes anchors whose `href` matches a small substring blocklist
  (`bit.ly`, `casino`, `crypto-spam`, etc.) by stripping the `href` and
  adding `rel="nofollow"`. This is intentionally crude — it's a substring
  match, so it can also catch legitimate URLs that happen to contain one of
  those words (see `tests/sanitize.test.mjs`).

It does **not** detect obfuscated JavaScript, hidden iframes, or anything
outside the patterns above. Review deployed output before pointing a real
domain at it.

## Setup

```bash
npm install
cp .env.example .env   # fill in the values below
```

Required environment variables (see `.env.example`):

- `VERCEL_TOKEN` — a [Vercel access token](https://vercel.com/account/tokens)
  with permission to create deployments and manage domains. Used by
  `/api/launch` etc. to deploy *recovered* sites — unrelated to whatever
  account this project itself is deployed under.
- `VERCEL_TEAM_ID` — optional, only if deploying recovered sites under a
  Vercel team.
- `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — from a
  [Clerk application](https://dashboard.clerk.com). The publishable key is
  baked into the frontend build (`VITE_` prefix, so it's not secret); the
  secret key is backend-only.
- `STRIPE_SECRET_KEY` — from [Stripe](https://dashboard.stripe.com/apikeys).
  Use a `sk_test_...` key until the full checkout flow has been verified
  with a test card.
- `STRIPE_PRICE_ID` — a one-time (not recurring) $18 Price in that Stripe
  account.
- `STRIPE_WEBHOOK_SECRET` — the signing secret for a webhook endpoint
  pointed at `/api/webhooks/stripe`, listening for `checkout.session.completed`.
- `PUBLIC_SITE_URL` — optional, defaults to `https://darealtyte.com`. Used
  to build the Stripe Checkout success/cancel redirect URLs.

## Running the tests

```bash
npm test        # pure-logic tests for domain validation + sanitization, no network
npm run typecheck
```

## Deploying

This project has both a Vite-built frontend (`index.html`, `admin.html`,
`src/`) and Vercel serverless functions under `api/`. `vercel.json` sets
`buildCommand`/`outputDirectory` for the frontend; the `api/` functions
build separately and automatically. Import this directory (`dareal-tyte/`)
as the project root in Vercel.
