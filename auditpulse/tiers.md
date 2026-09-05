# AuditPulse Tier System

Seven tiers, $0 to $29/month. Deliberately small steps instead of the old
$0 / $29 / $199 / $999+ cliff — see `api/tiers/index.ts` for the single
source of truth these mirror.

Every feature below either ships today or is a plain limit/format change
(export, branding, queue order). Nothing here requires a capability the
scanner doesn't have — the previous top tier promised active exploitation,
manual penetration testing, and SOC2/HIPAA compliance reporting, which
directly contradicted the product's own "passive, non-destructive checks
only" model. That wasn't a roadmap item, it was a claim the product could
never honor, so it isn't carried forward.

None of this is billing-enforced yet. Every tier's CTA routes to the same
free sign-up as Free — wiring real checkout and per-tier limits is a
separate step once Stripe is connected.

## Tier 1: Free — $0/forever
- 18 real security checks
- Up to 10 websites
- Unlimited on-demand audits
- Automatic weekly re-audits
- Trust badge & PDF certificate
- GitHub fix pull requests

## Tier 2: Starter — $5/month
- Everything in Free
- Priority email support

## Tier 3: Plus — $9/month
- Everything in Starter
- 90-day scan history & trend view

## Tier 4: Growth — $14/month (Most popular)
- Everything in Plus
- CSV export of every finding

## Tier 5: Team — $19/month
- Everything in Growth
- White-label PDF certificate — your logo, not ours
- Custom name on your trust badge

## Tier 6: Studio — $24/month
- Everything in Team
- Priority scan queue — your audits run first

## Tier 7: Agency — $29/month
- Everything in Studio
- Portfolio-wide CSV export across every client site
- Fastest support response — first in line
