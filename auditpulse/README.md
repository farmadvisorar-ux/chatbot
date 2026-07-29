# AuditPulse

A vulnerability audit platform: enter a URL, get a comprehensive, interactive
security report with severity-ranked findings and step-by-step fixes. Two
tiers, both unlimited audits and automatic re-audits every 30 days: **Audit**
and **Audit + Fix** (the latter additionally connects a GitHub repo per site
and can open a real pull request that fixes what it found). Each tier is
billable two ways: **monthly** ($7 / $14, a recurring subscription) or
**annually** ($59.99 / $99.99, a one-time payment for 365 days of access —
no auto-renewal).

Built as a static Vite frontend with Vercel serverless functions and
Postgres, following the same stack/conventions as this repo's `freshsaas/` app.

## Stack

- Frontend: Vite + TypeScript, no framework, Tailwind for base styles
- Backend: Vercel serverless functions in `api/`
- Scan engine: `lib/scanner/` — plain Node/TypeScript, no external scanning service
- Database: any Postgres (Vercel Postgres, Neon, Supabase, etc.) via `DATABASE_URL`
- Auth: [Clerk](https://clerk.com) — Google, Microsoft, email+password, email magic link
- Billing: [Stripe](https://stripe.com) — two recurring prices, "Audit" ($7/mo) and "Audit + Fix" ($14/mo)
- Transactional email: [Resend](https://resend.com) — report emails, welcome email
- Scheduling: Vercel Cron (`vercel.json`) — daily automatic 30-day re-audits
- Auto-fix: `lib/fixers/` — opens pull requests via the GitHub REST API using a per-site fine-grained PAT (Audit + Fix plan only)

## What the scanner actually does

Every check is passive and non-destructive — no exploitation, no brute
forcing, no DoS-style traffic:

| Tier | Checks | Requires |
|---|---|---|
| **Quick check** (free, public) | Security headers, TLS/certificate health, cookie flags, server fingerprinting | Nothing — one GET request, same as any browser visit |
| **Full audit** | Everything above, plus: exposed files/backups (well-known-path probes), CORS misconfiguration, mixed content, DNS email security (SPF/DMARC/CAA), outdated JS library detection, risky HTTP methods, subdomain exposure (via public Certificate Transparency logs), robots.txt disclosure, open-redirect heuristics | Sign-in + **proof of domain ownership** |

### Why ownership verification exists

A full audit sends more than one request to more than one path on the
target, and a SaaS that lets anyone type in *any* URL and get that treatment
is trivially abusable as a point-and-shoot scanning tool against sites the
caller doesn't control. So full audits are gated: adding a site requires
ticking an explicit authorization attestation (logged with timestamp + IP),
and running a full audit additionally requires proving control of the
domain via one of:

1. A file at `https://<domain>/.well-known/auditpulse-verify.txt` containing a token, or
2. A DNS TXT record at `_auditpulse-challenge.<domain>` containing that token.

The scan engine (`lib/scanner/net.ts`) also refuses to connect to
private/internal/link-local addresses (including the `169.254.169.254`
cloud metadata endpoint) on the initial target **and every redirect hop**,
so it can't be turned into an SSRF tool against the hosting provider's own
network even by a verified, well-intentioned user whose DNS gets hijacked
mid-scan.

**This tool is for auditing sites you own or are explicitly authorized to
test. Do not point it at third-party sites without permission.**

## What the auto-fix feature actually does (Audit + Fix plan)

AuditPulse only ever talks to your **live website** over HTTP — it never has
access to your source code. So "fix it" only works for a specific, narrow
set of findings where the fixer (`lib/fixers/`) can reliably guess *where in
a connected repo* the fix belongs, and always via a **pull request you
review and merge yourself** — nothing is ever pushed straight to a branch
you deploy from:

| Finding type | What the PR changes | Skipped if... |
|---|---|---|
| Missing/misconfigured security header | Adds the header to `vercel.json`'s `headers` block | No `vercel.json` in the repo |
| Outdated JS library (jQuery, Bootstrap, AngularJS, Lodash, Moment.js, Handlebars) | Bumps the version range in `package.json` | The library isn't an npm dependency (e.g. loaded from a CDN `<script>` tag) — lockfile isn't touched, so re-run your install after merging |
| Missing `security.txt` | Adds `public/.well-known/security.txt` or `static/.well-known/security.txt` | Neither directory exists in the repo |

Everything else (TLS/certificate issues, DNS records, CORS logic, cookie
flags, exposed credential files, mixed content, HTTP methods, subdomain
exposure, open redirects) stays a **manual fix** with the same
plain-English remediation text every plan gets — these either aren't
file-based (DNS, TLS), require an app-logic judgment call (CORS, cookies,
redirects), or need action outside repo content entirely (credential
rotation). A finding only shows a "Fix with PR" button when it's one of the
three types above.

**Connecting a repo**: per-site, the user pastes a **fine-grained GitHub
Personal Access Token** scoped to just that repo, with Contents and Pull
requests permissions set to Read and write (`api/targets/[id]/github.ts`).
The token is encrypted at rest with AES-256-GCM (`api/_lib/crypto.ts`,
`TOKEN_ENCRYPTION_KEY`) and only decrypted in-memory when opening a fix PR.
This is a v1: a proper GitHub App with an OAuth installation flow (no token
copy-pasting, installable per-organization, narrower default permissions) is
the natural next step before this scales past early users.

## Local setup

```bash
cd auditpulse
npm install
cp .env.example .env   # fill in DATABASE_URL at minimum
npm run migrate        # creates tables
npm run dev             # frontend only, at http://localhost:5173
```

The dev server only serves the static frontend — API routes need either
`vercel dev` (recommended: `npm i -g vercel`, then `vercel dev`) or a
deployed preview to exercise `/api/*`.

## Deploying to Vercel

1. Import this repo (or just the `auditpulse/` directory as its own Vercel
   project) in the Vercel dashboard. Vercel auto-detects the Vite build
   (`npm run build`, output `dist`) and the `api/` functions.
2. Provision a Postgres database and set `DATABASE_URL`.
3. Run the migration once: `DATABASE_URL=... npm run migrate` (or
   `npm run migrate:http` from a sandboxed environment with no direct
   TCP/5432 access — Neon databases only).
4. Set `PUBLIC_SITE_URL` to your production URL (used in emailed report links
   and Stripe redirects).
5. Set up Clerk, Stripe, and Resend (below), then deploy. **Redeploy after
   adding/changing any env var** — Vite inlines `VITE_*` vars at build time.
6. `vercel.json` registers the daily cron (`/api/cron/rescan`, 13:00 UTC).
   Set `CRON_SECRET` so only Vercel's own cron invocations can trigger it —
   Vercel automatically sends it as a Bearer token when the env var is set.

## Setting up sign-in (Clerk)

Same as `freshsaas/` — see that app's README for the full walkthrough. In
short: create a Clerk app, enable Email/Google/Microsoft, set
`VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`, then point a Clerk
webhook (`user.created`/`user.updated`/`user.deleted`) at
`/api/webhooks/clerk` and set `CLERK_WEBHOOK_SECRET`.

## Setting up billing (Stripe)

1. In the Stripe Dashboard, create one **Product** ("AuditPulse") with four
   **prices**:
   - $7.00/month, **recurring** — "Audit" monthly → `STRIPE_PRICE_ID_AUDIT`
   - $14.00/month, **recurring** — "Audit + Fix" monthly → `STRIPE_PRICE_ID_AUDIT_FIX`
   - $59.99, **one-time** — "Audit" annual → `STRIPE_PRICE_ID_AUDIT_ANNUAL`
   - $99.99, **one-time** — "Audit + Fix" annual → `STRIPE_PRICE_ID_AUDIT_FIX_ANNUAL`

   The annual prices must be created as **one-time** (not recurring) — they're
   billed once for a year of access, not on an auto-renewing schedule.
2. Copy your **Secret key** into `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint at `https://<your-domain>/api/webhooks/stripe`
   subscribed to `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, and `customer.subscription.deleted`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Users choose a plan and billing interval from `account.html` (or the
   landing page's Monthly/Annual toggle), which calls `/api/billing/checkout`
   with `{ plan: 'audit' | 'audit_fix', interval: 'month' | 'year' }`.
   - `interval: 'month'` creates a **subscription**-mode Checkout Session;
     the webhook syncs `users.subscription_status`/`plan` from it as usual,
     and `/api/billing/portal` (Stripe Billing Portal) handles self-serve
     cancellation. If a subscriber wants to switch between Audit and
     Audit + Fix inside the portal rather than via `account.html`, enable
     "Update subscription" in the portal's configuration (Stripe Dashboard
     → Settings → Billing → Customer portal) and add both monthly prices to it.
   - `interval: 'year'` creates a **payment**-mode Checkout Session (no
     Stripe Subscription object at all); the webhook grants 365 days of
     access by setting `users.plan_expires_at`, stacking on top of any
     remaining time if they renew early. There's no Billing Portal entry for
     these since there's no subscription to manage — they simply lapse
     unless repurchased.

## Setting up report emails (Resend)

1. Create a Resend account and API key, set `RESEND_API_KEY`.
2. Verify a sending domain under Resend → Domains, and update the `SENDER`
   constant in `api/_lib/email.ts` to an address on that domain — without a
   verified domain, Resend's sandbox sender can only deliver to your own
   Resend account address.

## What's implemented vs. what to harden before real-world launch

- All scan checks are real and functional (see table above) — this is not a
  stubbed demo.
- Domain ownership verification, SSRF-safe fetching, and a hard subscription
  gate on scan volume are implemented.
- **Rate limiting** is best-effort/IP-based (Postgres-backed, since
  serverless functions share no memory). Add a CAPTCHA on `/api/quick-check`
  if it sees abuse.
- **Legal**: `attested_authorization` is a self-reported checkbox, not a
  KYC-grade authorization check. For a paid public product, consider
  requiring the *technical* ownership proof (not just the checkbox) before
  running any full audit against a domain the account hasn't verified
  before, and add a Terms of Service the checkbox links to.
- The scan engine runs synchronously inside the request (`maxDuration: 30`
  on `/api/scans`). At real scale, move it to a queue/background job so a
  slow target can't tie up a function invocation.
- `api/cron/rescan.ts` processes a small batch (5) per run to stay within
  function time limits; a large subscriber base needs a proper job queue
  instead of a single cron sweep.
- The auto-fix feature is PAT-based (see above) rather than a full GitHub
  App — fine for early users, but a token pasted into a text field is a
  weaker trust boundary than an App installation with per-repo, revocable
  access. Upgrade this before broad rollout.

## Security notes

- All API input is validated and length-capped server-side; SQL uses
  parameterized queries throughout.
- `escapeHtml` is applied everywhere user- or scan-supplied text is inserted
  via `innerHTML`, including inside report emails.
- The scan engine never fetches private/internal IP ranges (RFC1918,
  loopback, link-local/cloud-metadata) — checked on the original target URL
  and re-checked on every redirect hop it follows.
- Full audits require both an authorization attestation and technical proof
  of domain control before any multi-path/CORS-probing/exposed-file check runs.
- Report links use an unguessable, unique `share_token` (not the scan's
  sequential id) so a client can view their report without an account
  without exposing other users' reports.
- GitHub PATs are encrypted at rest with AES-256-GCM (`api/_lib/crypto.ts`)
  and are only ever decrypted server-side, in-memory, at the moment a fix PR
  is opened — never sent back to the browser.
- Every auto-fix runs on a **new branch and opens a PR**; nothing is ever
  committed directly to a default/deploy branch, so a bad fix is always a
  no-op until a human merges it.
