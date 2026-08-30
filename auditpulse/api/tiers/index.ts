import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod, isRead } from '../_lib/http.js';

interface Tier {
  id: number;
  name: string;
  price: string;
  billing_period: string;
  description: string;
  features: string[];
  coming_soon: boolean;
  badge?: string;
  featured?: boolean;
}

const TIERS: Tier[] = [
  {
    id: 1,
    name: 'Free',
    price: '$0',
    billing_period: 'forever',
    description: 'Everything you need to secure your own sites',
    features: [
      '18 core security checks',
      'Up to 10 websites',
      'Unlimited on-demand audits',
      'Automatic weekly re-audits',
      'Public trust badge & PDF certificate',
      'GitHub fix pull requests',
      'Email reports after every audit',
    ],
    coming_soon: false,
    featured: false,
  },
  {
    id: 2,
    name: 'Professional',
    price: '$29',
    billing_period: '/month',
    description: 'Advanced scanning for growing teams',
    features: [
      '30 security checks (18 core + 12 advanced)',
      'Daily automatic re-audits',
      'Up to 50 websites',
      'Custom report branding',
      'Team collaboration (3 users)',
      'Slack & email integrations',
      'Read-only API access',
      'Priority support',
    ],
    coming_soon: true,
    badge: 'Popular',
    featured: true,
  },
  {
    id: 3,
    name: 'Enterprise',
    price: '$199',
    billing_period: '/month',
    description: 'Complete security automation for enterprises',
    features: [
      '50 security checks (18 + 12 + 20 advanced)',
      'Real-time scanning on demand',
      'Unlimited websites',
      'Custom workflows & automation',
      'Team collaboration (unlimited)',
      'Priority support (2hr response)',
      'Advanced analytics & reporting',
      'Single sign-on (SAML)',
      'Compliance reporting',
    ],
    coming_soon: true,
    featured: false,
  },
  {
    id: 4,
    name: 'Elite Penetration Testing',
    price: '$999+',
    billing_period: '/month',
    description: 'World-class penetration testing & hack simulation',
    features: [
      '70+ security checks including active exploitation',
      'Real-time continuous monitoring',
      'Unlimited sites & subdomains',
      'Manual penetration testing by certified experts',
      'Zero-day vulnerability research',
      'Red team exercises & hack simulations',
      '24/7 dedicated security consultant',
      'Custom compliance reporting (SOC2, PCI-DSS, HIPAA)',
      'Incident response retainer',
    ],
    coming_soon: true,
    featured: false,
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isRead(req)) {
    return requireMethod(res, ['GET']);
  }

  return json(res, 200, { tiers: TIERS });
}
