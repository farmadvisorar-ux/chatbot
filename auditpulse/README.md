# AuditPulse

A vulnerability audit platform: enter a URL, get a comprehensive, interactive
security report with severity-ranked findings and step-by-step fixes. It is
**free** — every signed-in account gets unlimited sites, unlimited on-demand
audits, automatic re-audits every 30 days, an embeddable trust badge, PDF
certificates, and GitHub-connected pull requests that fix what was found.

Built as a static Vite frontend with Vercel serverless functions and
Postgres, following the same stack/conventions as this repo's `freshsaas/` app.

## Stack

- Frontend: Vite + TypeScript, no framework, Tailwind for base styles
- Backend: Vercel serverless functions in `api/`
- Scan engine: `lib/scanner/` — plain Node/TypeScript, no external scanning service
- Database: any Postgres (Vercel Postgres, Neon, Supabase, etc.) via `DATABASE_URL`
- Auth: [Clerk](https://clerk.com) — Google, Microsoft, email+password, email magic link
- Transactional email: [Resend](https://resend.com) — report emails, welcome email
- Scheduling: Vercel Cron (`vercel.json`) — daily automatic 30-day re-audits
- Auto-fix: `lib/fixers/` — opens pull requests via the GitHub REST API using a per-site fine-grained PAT

## What the scanner actually does

Every check is passive and non-destructive — no exploitation, no brute
forcing, no DoS-style traffic. A full audit isn't limited to the homepage:
it crawls up to 5 same-origin pages linked from it (`lib/scanner/crawl.ts`)
so mixed-content, exposed-secrets, and subresource-integrity checks see more
than just `/`.

| Tier | Checks | Requires |
|---|---|---|
| **Quick check** (free, public) | Security headers, TLS/certificate health, cookie flags, server fingerprinting | Nothing — one GET request, same as any browser visit |
| **Full audit** | Everything above, plus: exposed files/backups (well-known-path probes), directory-listing exposure, CORS misconfiguration, mixed content (crawled), HTTPS-redirect enforcement, subresource integrity on third-party scripts (crawled), hardcoded secrets in JS bundles (crawled), GraphQL introspection exposure, DNS email security (SPF/DMARC/CAA), outdated JS library detection, risky HTTP methods, subdomain exposure (via public Certificate Transparency logs), robots.txt disclosure, open-redirect heuristics | Sign-in + **proof of domain ownership** |

Every finding carries two write-ups, not one: a plain-English **impact**
sentence (“what could actually go wrong”, aimed at the site owner, always
visible without expanding the row) and a **technical description** (aimed at
whoever fixes it, behind the expand toggle) plus remediation steps. Every
scan result also opens with one auto-generated executive-summary sentence
("Scored a C+. Top priority: … — fix this first.") and a collapsible
severity glossary explaining what Critical/High/Medium/Low/Info actually
mean in terms of urgency — see `executiveSummaryHtml` / `severityGlossaryHtml`
in `src/findings-view.ts`.

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

## What the auto-fix feature actually does

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
plain-English remediation text — these either aren't
file-based (DNS, TLS), require an app-logic judgment call (CORS, cookies,
redirects), or need action outside repo content entirely (credential
rotation). A finding only shows a "Fix with PR" button when it's one of the
three types above.

**Connecting a repo**: per-site, the user pastes a **fine-grained GitHub
Personal Access Token** scoped to just that repo, with Contents and Pull
requests permissions set to Read and write (`api/targets/[id].ts`).
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
4. Set `PUBLIC_SITE_URL` to your production URL (used in emailed report links,
   the PDF certificate, and the embeddable trust badge).
5. Set up Clerk and Resend (below), then deploy. **Redeploy after
   adding/changing any env var** — Vite inlines `VITE_*` vars at build time.
6. `vercel.json` registers the daily cron (`/api/cron/rescan`, 13:00 UTC).
   Set `CRON_SECRET` so only Vercel's own cron invocations can trigger it —
   Vercel automatically sends it as a Bearer token when the env var is set.

## Custom domain (brokehealth.com)

Production runs on **https://brokehealth.com**. The domain is registered at
Namecheap, so DNS lives there rather than on Vercel nameservers. Required
records at Namecheap → Domain List → brokehealth.com → Advanced DNS:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `216.150.1.1` | Automatic |
| A | `@` | `216.150.16.1` | Automatic |
| CNAME | `www` | `11f9158fced37d96.vercel-dns-017.com.` | Automatic |

Delete the Namecheap parking records first — the default `A @ 162.255.119.85`
and `CNAME www parkingpage.namecheap.com.` will conflict. `www` is configured
in Vercel as a 308 redirect to the apex, so both resolve to the same site.

Vercel issues the TLS certificate automatically once the records resolve
(usually minutes; DNS propagation can take up to a few hours).

Two things are tied to this domain and need updating if it ever changes:
`PUBLIC_SITE_URL` (Vercel env var, plus the fallback in `api/_lib/site.ts`)
and `SENDER` in `api/_lib/email.ts`, which must be an address on a domain
verified under Resend → Domains or report emails will not deliver.

## Setting up sign-in (Clerk)

Same as `freshsaas/` — see that app's README for the full walkthrough. In
short: create a Clerk app, enable Email/Google/Microsoft, set
`VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`, then point a Clerk
webhook (`user.created`/`user.updated`/`user.deleted`) at
`/api/webhooks/clerk` and set `CLERK_WEBHOOK_SECRET`.

Sign-up, sign-in, and password reset are all handled by Clerk's hosted
modal (`openSignUp`/`openSignIn` in `src/auth.ts`) — there's no custom
auth code to write. As long as the Email/password strategy is turned on for
the Clerk app, "Forgot password?" is included automatically; nothing further
is needed here to get the full sign-up/login/reset flow working.

## Pricing model

AuditPulse is free. There is no billing integration, no plan gating, and no
usage cap: every signed-in account gets unlimited sites, unlimited on-demand
audits, automatic 30-day re-audits, the trust badge, PDF certificates, and
GitHub fix pull requests.

The `users` table still carries the vestigial `stripe_*`, `plan`,
`subscription_status` and `plan_expires_at` columns, and the
`stripe_events_processed` table still exists. They are unused and left in
place so the migration stays additive — drop them separately if you want a
clean schema.

## Email wall

The landing page shows a modal 10 seconds after load asking for an email
(`src/email-wall.ts` + `api/email-capture.ts`). Once someone submits, it
never shows again for them; dismissing it only hides it for that page view.

Suppression is layered so clearing one signal isn't enough to bring the
prompt back:

1. A `localStorage` flag, checked first so repeat visits cost no network call.
2. An `HttpOnly` `ap_ew` cookie set by the server on submit.
3. A lookup by client IP against `email_captures`, which covers cleared
   cookies and a second browser on the same connection.

The IP fallback is deliberately coarse — behind a shared NAT one person's
submission suppresses the prompt for everyone on that address. That is the
right trade for a marketing prompt and would **not** be acceptable for
anything security-relevant.

Captured emails and IP addresses are personal data. Before driving real
traffic you need a privacy policy covering what is stored, why, and for how
long, plus a way to honour deletion requests (`DELETE FROM email_captures
WHERE lower(email) = ...`). The cookie is functional (it only records "this
visitor already answered") rather than advertising, which is generally
exempt from consent banners, but confirm that against your own jurisdiction.

## Setting up report emails (Resend)

1. Create a Resend account and API key, set `RESEND_API_KEY`.
2. Verify a sending domain under Resend → Domains, and update the `SENDER`
   constant in `api/_lib/email.ts` to an address on that domain — without a
   verified domain, Resend's sandbox sender can only deliver to your own
   Resend account address.

## The dashboard

Signed-in users land on an **overview**: stat tiles (site count, verified
count, open critical/high findings across every site, sites due for
re-audit soon), a risk-sorted "needs attention" list, and a cross-site
recent-activity feed — all from two requests (`GET /api/targets`, which
joins in each site's latest completed scan, and `GET /api/scans`, which
lists recent scans across every site the user owns). The site list is
searchable and sorted by urgency (unverified → unscanned → worst findings
first) rather than just creation date. Selecting a site shows a score
sparkline across its scan history, a collapsible "Setup" section that
collapses to one line once verification + GitHub are both done, and the
existing scan history / findings / email / fix-with-PR flows.

## Trust badge and PDF certificate

Once a site is verified (proven ownership) and has at least one completed
scan, two things become available from its dashboard detail panel:

- **Embeddable trust badge** — `GET /api/targets/:id?action=badge-svg`
  (public, no auth) returns a self-contained SVG showing the site's current
  grade, which the dashboard gives the user as a ready-to-paste `<a><img></a>`
  snippet. The image never loads external fonts or resources (it can't — an
  `<img>`-embedded SVG on a third-party site can't reach cross-origin
  resources), and it 404s cleanly for an unknown/deleted target id rather
  than rendering a plausible-looking fake result. The badge links to
  `verify.html?t=:id`, a public page backed by `GET
  /api/targets/:id?action=badge-info` that shows the domain, grade, and
  last-audited date — never findings or evidence, since that page has no
  authentication and is meant to be viewed by anyone. (Actions are dispatched
  via a query param rather than an extra path segment — see the comment atop
  `api/targets/[id].ts` for why.)
- **Certificate-style PDF** — `lib/pdf/report.ts` (via `pdfkit`, no headless
  browser needed) renders a cover page (grade, score, verification status, a
  plain-English "what this certifies" statement) followed by every finding
  in full detail. It's attached to the report email both when a user clicks
  "Email report" and on every automatic 30-day re-audit, so the emailed
  proof and the badge/report stay in sync without the user having to
  regenerate anything.

Both routes are intentionally unauthenticated — a target id is an
unguessable UUID, and neither route exposes anything beyond what the badge
itself already shows to anyone who sees it embedded.

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
- The exposed-secrets check (`lib/scanner/checks/exposedSecrets.ts`) never
  stores a matched credential in full — the `evidence` saved to the database
  is redacted (`AKIAABCD••••••••MNOP`) to a handful of leading/trailing
  characters, enough to identify the credential without the report itself
  becoming a second place it leaks from.
- The GraphQL introspection check sends a single standard, read-only
  introspection query (the same one GraphiQL/Apollo Studio send) — it never
  reads or mutates application data.
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
