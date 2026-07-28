# AuditPulse

A vulnerability audit platform: enter a URL, get a comprehensive, interactive
security report with severity-ranked findings and step-by-step fixes. Sign up
for unlimited on-demand audits, automatic re-audits every 30 days, and
one-click report emails to clients — $100/month.

Built as a static Vite frontend with Vercel serverless functions and
Postgres, following the same stack/conventions as this repo's `freshsaas/` app.

## Stack

- Frontend: Vite + TypeScript, no framework, Tailwind for base styles
- Backend: Vercel serverless functions in `api/`
- Scan engine: `lib/scanner/` — plain Node/TypeScript, no external scanning service
- Database: any Postgres (Vercel Postgres, Neon, Supabase, etc.) via `DATABASE_URL`
- Auth: [Clerk](https://clerk.com) — Google, Microsoft, email+password, email magic link
- Billing: [Stripe](https://stripe.com) — one recurring $100/month "Unlimited" price
- Transactional email: [Resend](https://resend.com) — report emails, welcome email
- Scheduling: Vercel Cron (`vercel.json`) — daily automatic 30-day re-audits

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

1. In the Stripe Dashboard, create a **Product** ("AuditPulse Unlimited")
   with a **recurring price** of $100.00/month. Copy the price id
   (`price_...`) into `STRIPE_PRICE_ID`.
2. Copy your **Secret key** into `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint at `https://<your-domain>/api/webhooks/stripe`
   subscribed to `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, and `customer.subscription.deleted`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Users upgrade from `account.html`, which calls `/api/billing/checkout`
   (Stripe Checkout) and `/api/billing/portal` (Stripe Billing Portal for
   self-serve cancellation/plan management).

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
