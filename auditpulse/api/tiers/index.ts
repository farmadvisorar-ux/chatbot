import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from '../_lib/http.js';

interface Tier {
  id: number;
  name: string;
  price: string;
  billing_period: string;
  description: string;
  features: string[];
  ctaLabel: string;
  coming_soon: boolean;
  badge?: string;
  featured?: boolean;
}

/**
 * Seven tiers, $0 to $29. Free is live; the six above it are marked
 * coming_soon and ship one at a time as each is actually finished.
 *
 * The line between free and paid is deliberately NOT "how many checks" —
 * every plan runs all 18, because a half-scan that hides the critical
 * finding you needed is a worse product, not a cheaper one. Free finds
 * what's wrong and will even open the fix PR.
 *
 * What money will buy is time and attention: how fast you hear about a new
 * problem (weekly -> daily -> hourly -> every deploy), how much of your
 * surface is watched (5 pages -> 100 -> behind the login -> every
 * subdomain), whether the fix happens without you, and whether the whole
 * thing carries your name in front of a client.
 *
 * Every feature here extends something the scanner already does:
 * cert expiry already computes daysLeft (tls.ts), subdomain discovery
 * already reads Certificate Transparency logs (subdomainEnum.ts), the
 * crawler already takes a page budget (crawl.ts), three auto-fixers
 * already open PRs (lib/fixers/), and the webhook route already exists
 * for adding providers. Nothing here needs a capability this scanner
 * philosophically can't have — no exploitation, no manual pentesting,
 * no compliance certifications it can't issue.
 *
 * Flip coming_soon to false only when the tier's features actually work.
 * See tiers.md for what each one still needs.
 */
const TIERS: Tier[] = [
  {
    id: 1,
    name: 'Free',
    price: '$0',
    billing_period: 'forever',
    description: 'Find out what is actually wrong with your site.',
    features: [
      'All 18 security checks — no half-scans',
      'Up to 10 websites',
      'Unlimited on-demand audits',
      'Weekly automatic re-audit',
      'Trust badge & PDF certificate',
      'One-click GitHub fix pull requests',
    ],
    ctaLabel: 'Get started free',
    coming_soon: false,
    badge: 'Live now',
    featured: true,
  },
  {
    id: 2,
    name: 'Starter',
    price: '$5',
    billing_period: '/month',
    description: 'Hear about it the day it breaks — not next Sunday.',
    features: [
      'Everything in Free, plus:',
      'Daily re-audits — 7× faster detection',
      'Instant alert the moment a new issue appears',
      'Certificate expiry warnings at 30, 14, 7 and 1 day',
      '25 pages crawled per audit, up from 5',
    ],
    ctaLabel: 'Coming soon',
    coming_soon: true,
    badge: 'Shipping first',
  },
  {
    id: 3,
    name: 'Plus',
    price: '$9',
    billing_period: '/month',
    description: 'Know the moment anything on your site changes.',
    features: [
      'Everything in Starter, plus:',
      'Change alerts — a new third-party script, an altered header, a dropped CSP',
      'New-subdomain alerts from Certificate Transparency logs',
      '90-day history with a score trend chart',
      '100 pages crawled per audit',
    ],
    ctaLabel: 'Coming soon',
    coming_soon: true,
  },
  {
    id: 4,
    name: 'Growth',
    price: '$14',
    billing_period: '/month',
    description: 'Put security in the workflow your team already uses.',
    features: [
      'Everything in Plus, plus:',
      'Slack, Discord and webhook alerts',
      'REST API with your own keys',
      'GitHub Action that fails the build on a new Critical or High',
      'Hourly re-audits',
      'CSV and JSON export of every finding',
    ],
    ctaLabel: 'Coming soon',
    coming_soon: true,
  },
  {
    id: 5,
    name: 'Team',
    price: '$19',
    billing_period: '/month',
    description: 'Stop hand-fixing what a robot can fix for you.',
    features: [
      'Everything in Growth, plus:',
      'Auto-fix — the pull request opens itself when a fixable issue appears',
      'Authenticated scanning — audit the pages behind your login',
      'Up to 50 websites and 5 teammates',
      'Per-site repo mapping for multi-repo setups',
    ],
    ctaLabel: 'Coming soon',
    coming_soon: true,
  },
  {
    id: 6,
    name: 'Studio',
    price: '$24',
    billing_period: '/month',
    description: 'Hand a client something with your name on it, not ours.',
    features: [
      'Everything in Team, plus:',
      'White-label PDF, badge and reports — your logo, your name',
      'Monthly client reports, emailed automatically',
      'Read-only client dashboards, one per customer',
      'A public security status page for every site',
    ],
    ctaLabel: 'Coming soon',
    coming_soon: true,
  },
  {
    id: 7,
    name: 'Agency',
    price: '$29',
    billing_period: '/month',
    description: 'Run the whole book of business from one screen.',
    features: [
      'Everything in Studio, plus:',
      'Continuous monitoring — a fresh audit on every deploy',
      'Unlimited websites and client seats',
      'Portfolio dashboard — every client scored, worst first',
      'Security-questionnaire evidence pack, exported on demand',
      'Priority scan queue and first-in-line support',
    ],
    ctaLabel: 'Coming soon',
    coming_soon: true,
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireMethod(req, res, ['GET'])) return;
  json(res, 200, { tiers: TIERS });
}
