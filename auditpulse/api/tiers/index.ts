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
  badge?: string;
  featured?: boolean;
}

/**
 * Seven tiers, $0 to $29 — deliberately small, frequent price steps rather
 * than the old $0/$29/$199/$999 cliff. Every feature listed here either
 * ships today or is a plain limit/format change (export, branding, queue
 * order) — nothing requires capabilities the scanner doesn't have. That
 * ruled out the previous "Elite" tier's promises (active exploitation,
 * manual pentesting, SOC2/HIPAA reports): this product's whole model is
 * passive, non-destructive checks, so selling the opposite at the top of
 * the ladder wasn't a future roadmap item, it was a contradiction.
 *
 * None of this is billing-enforced yet — every CTA below routes to the
 * same free sign-up as the Free tier. Wiring real checkout and per-tier
 * limits is a separate step once Stripe is connected.
 */
const TIERS: Tier[] = [
  {
    id: 1,
    name: 'Free',
    price: '$0',
    billing_period: 'forever',
    description: 'Everything you need to secure your own sites',
    features: [
      '18 real security checks',
      'Up to 10 websites',
      'Unlimited on-demand audits',
      'Automatic weekly re-audits',
      'Trust badge & PDF certificate',
      'GitHub fix pull requests',
    ],
    ctaLabel: 'Get started free',
  },
  {
    id: 2,
    name: 'Starter',
    price: '$5',
    billing_period: '/month',
    description: 'A little more room to grow',
    features: [
      'Everything in Free',
      'Priority email support',
    ],
    ctaLabel: 'Start with Starter',
  },
  {
    id: 3,
    name: 'Plus',
    price: '$9',
    billing_period: '/month',
    description: 'Built for freelancers with client sites to answer for',
    features: [
      'Everything in Starter',
      '90-day scan history & trend view',
    ],
    ctaLabel: 'Start with Plus',
  },
  {
    id: 4,
    name: 'Growth',
    price: '$14',
    billing_period: '/month',
    description: 'For teams who want proof, not just a promise',
    features: [
      'Everything in Plus',
      'CSV export of every finding',
    ],
    ctaLabel: 'Start with Growth',
    badge: 'Most popular',
    featured: true,
  },
  {
    id: 5,
    name: 'Team',
    price: '$19',
    billing_period: '/month',
    description: 'Reports that look like they came from you',
    features: [
      'Everything in Growth',
      'White-label PDF certificate — your logo, not ours',
      'Custom name on your trust badge',
    ],
    ctaLabel: 'Start with Team',
  },
  {
    id: 6,
    name: 'Studio',
    price: '$24',
    billing_period: '/month',
    description: 'For agencies running audits at scale',
    features: [
      'Everything in Team',
      'Priority scan queue — your audits run first',
    ],
    ctaLabel: 'Start with Studio',
  },
  {
    id: 7,
    name: 'Agency',
    price: '$29',
    billing_period: '/month',
    description: 'Everything, for your whole portfolio',
    features: [
      'Everything in Studio',
      'Portfolio-wide CSV export across every client site',
      'Fastest support response — first in line',
    ],
    ctaLabel: 'Start with Agency',
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireMethod(req, res, ['GET'])) return;
  json(res, 200, { tiers: TIERS });
}
