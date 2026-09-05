# AuditPulse Tier System

Seven tiers, $0 to $29/month. `api/tiers/index.ts` is the single source of
truth; this file explains the reasoning and tracks what actually ships.

## The line between free and paid

Not the number of checks. Every plan runs all 18 — a half-scan that hides
the critical finding you needed is a worse product, not a cheaper one, and
gating checks would make the free trust badge a lie about coverage.

Paid buys **time and attention** along four axes:

| Axis | Free | Top of ladder |
| --- | --- | --- |
| Time to detection | weekly | every deploy |
| Surface watched | 5 pages | 100 pages, behind the login, every subdomain |
| Who does the fixing | you click | the PR opens itself |
| Whose name is on it | ours | yours |

## Why the old ladder was replaced

It jumped $0 → $29 → $199 → $999+, the three paid tiers were disabled
"Coming Soon" buttons, and the top tier sold active exploitation, manual
penetration testing and SOC2/HIPAA compliance reporting — on a scanner
whose entire pitch is passive, non-destructive checks ("0 exploitation,
ever" is on the homepage). Those weren't roadmap items; they were claims
the product could never honor.

The first replacement swung too far the other way: seven honest tiers whose
paid perks were priority support, scan history and CSV export. Defensible,
but nobody pays $5/month for a filing cabinet when the free tier already
finds every issue and opens the fix PR. The current ladder sells the thing
that's actually worth money — knowing sooner, and not having to act by hand.

## Tiers

### Tier 1: Free — $0/forever
*Find out what is actually wrong with your site.*
- All 18 security checks — no half-scans
- Up to 10 websites
- Unlimited on-demand audits
- Weekly automatic re-audit
- Trust badge & PDF certificate
- One-click GitHub fix pull requests

### Tier 2: Starter — $5/month
*Hear about it the day it breaks — not next Sunday.*
- Daily re-audits — 7× faster detection
- Instant alert the moment a new issue appears
- Certificate expiry warnings at 30, 14, 7 and 1 day
- 25 pages crawled per audit

### Tier 3: Plus — $9/month
*Know the moment anything on your site changes.*
- Change alerts — new third-party script, altered header, dropped CSP
- New-subdomain alerts from Certificate Transparency logs
- 90-day history with a score trend chart
- 100 pages crawled per audit

### Tier 4: Growth — $14/month (Most popular)
*Put security in the workflow your team already uses.*
- Slack, Discord and webhook alerts
- REST API with your own keys
- GitHub Action that fails the build on a new Critical or High
- Hourly re-audits
- CSV and JSON export of every finding

### Tier 5: Team — $19/month
*Stop hand-fixing what a robot can fix for you.*
- Auto-fix — the PR opens itself when a fixable issue appears
- Authenticated scanning — audit the pages behind your login
- Up to 50 websites and 5 teammates
- Per-site repo mapping for multi-repo setups

### Tier 6: Studio — $24/month
*Hand a client something with your name on it, not ours.*
- White-label PDF, badge and reports
- Monthly client reports, emailed automatically
- Read-only client dashboards, one per customer
- A public security status page for every site

### Tier 7: Agency — $29/month
*Run the whole book of business from one screen.*
- Continuous monitoring — a fresh audit on every deploy
- Unlimited websites and client seats
- Portfolio dashboard — every client scored, worst first
- Security-questionnaire evidence pack
- Priority scan queue and first-in-line support

## Build status

Everything in Free ships today. Nothing above it is billing-enforced yet —
every CTA routes to the same free sign-up, so no one can pay for an
unbuilt feature. Wiring checkout **must** come after the tier it sells.

Each queued item extends code that already exists, which is why they're
sellable as a roadmap rather than fiction:

| Feature | Foundation already in the repo | Work needed |
| --- | --- | --- |
| Daily / hourly / per-deploy cadence | `api/cron/rescan.ts`, Vercel cron | Read cadence from the user's tier; add cron entries |
| Per-tier crawl depth | `crawl.ts` already takes a `maxPages` budget | Pass a tier-derived number |
| Instant new-issue alerts | findings stored per scan; Resend wired | Diff against previous scan, send on delta |
| Cert expiry warnings | `tls.ts` already computes `daysLeft` | Schedule threshold emails instead of only reporting at scan time |
| Change alerts | `subresourceIntegrity.ts` / `headers.ts` inventory scripts and headers | Store a baseline, diff, alert |
| New-subdomain alerts | `subdomainEnum.ts` already reads crt.sh | Persist the set, alert on additions |
| Trend chart / 90-day history | every scan already persisted with score | Query + chart in the dashboard |
| Auto-fix on detection | `lib/fixers/` opens PRs today, on click | Trigger from the scan pipeline |
| Slack / Discord / webhooks | `api/webhooks/[provider].ts` is a dynamic route built for more providers | Outbound senders + per-site config |
| REST API + keys | handlers exist; auth is Clerk-only | API key issuance and verification |
| GitHub Action | `lib/github.ts` holds the API client | Publish an action that calls a scan endpoint |
| CSV / JSON export | findings are already structured rows | Serializer + download route |
| Site & seat limits | `MAX_TARGETS_PER_USER` is one uniform constant | Make it per-tier; add a users↔team model for seats |
| White-label | `lib/pdf/report.ts`, `api/_lib/badge.ts` have fixed branding | Per-account logo/name overrides |
| Authenticated scanning | `net.ts` performs the fetches | Credential storage + injection, gated on domain ownership |
| Priority queue | scans run inline today | A real queue with tier-ordered dequeue |
