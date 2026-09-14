import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { siteOrigin } from '../_lib/site.js';
import { clean } from '../_lib/validate.js';
import { billingConfigured, ensurePrice, stripeClient, PURCHASABLE } from '../_lib/billing.js';

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
  /** Set on the way out for tiers that are both built and payable — see the handler. */
  slug?: string;
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
    badge: 'Shipping next',
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

/** Slug for each published tier, in the order they appear above. */
const SLUGS = ['free', 'starter', 'plus', 'growth', 'team', 'studio', 'agency'];

/**
 * The pricing page, plus the two calls that turn it into a checkout:
 *   (no action)       -> GET the published ladder
 *   ?action=checkout  -> POST { tier } and get a Stripe Checkout URL back
 *   ?action=portal    -> POST and get a Stripe billing-portal URL back
 *
 * A tier is buyable only when it is BOTH built (present in PURCHASABLE) and
 * payable (a Stripe key is configured). Both halves are computed here rather
 * than stored as a flag on each tier, so an unconfigured deployment shows
 * "Coming soon" on its own instead of offering a button that 501s.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  if (action === 'checkout') return startCheckout(req, res);
  if (action === 'portal') return openPortal(req, res);
  if (action) {
    error(res, 404, 'Not found.');
    return;
  }

  if (!requireMethod(req, res, ['GET'])) return;

  const payable = billingConfigured();
  const tiers = TIERS.map((tier, index) => {
    const slug = SLUGS[index];
    if (!tier.coming_soon || !payable || !PURCHASABLE[slug]) return { ...tier, slug };
    return { ...tier, slug, coming_soon: false, ctaLabel: `Get ${tier.name}` };
  });
  json(res, 200, { tiers, billingConfigured: payable });
}

async function startCheckout(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireMethod(req, res, ['POST'])) return;

  const stripe = stripeClient();
  if (!stripe) {
    error(res, 501, 'Billing is not configured on this deployment yet.');
    return;
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const slug = clean(req.body?.tier, 20).toLowerCase();
  if (!PURCHASABLE[slug]) {
    error(res, 400, 'That plan is not available yet.');
    return;
  }

  const pool = getPool();
  const { rows } = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [user.userId]);
  const customerId: string | null = rows[0]?.stripe_customer_id ?? null;

  try {
    const price = await ensurePrice(stripe, slug);
    const origin = siteOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      // Reuse the existing customer so a second subscription doesn't create a
      // duplicate record; fall back to the email for a first-time buyer.
      ...(customerId ? { customer: customerId } : { customer_email: user.email }),
      client_reference_id: user.userId,
      // Stamped on the subscription, not just the session: subscription.*
      // events arrive without the checkout session, and this is what lets the
      // webhook tie one back to an account.
      subscription_data: { metadata: { auditpulse_user_id: user.userId, auditpulse_tier: slug } },
      metadata: { auditpulse_user_id: user.userId, auditpulse_tier: slug },
      allow_promotion_codes: true,
      success_url: `${origin}/account.html?checkout=success`,
      cancel_url: `${origin}/pricing.html?checkout=cancelled`,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    json(res, 200, { url: session.url });
  } catch (err) {
    console.error('Could not start checkout:', err);
    error(res, 502, 'Could not start checkout. Try again in a moment.');
  }
}

/**
 * Stripe's hosted billing portal — the customer's own page for changing plan,
 * updating a card, reading invoices and cancelling.
 *
 * Cancellation lives there rather than in our dashboard on purpose: a cancel
 * button we own would have to stay correct against proration, trial state and
 * partial periods, and getting that wrong takes money from someone who asked
 * to stop paying.
 */
async function openPortal(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireMethod(req, res, ['POST'])) return;

  const stripe = stripeClient();
  if (!stripe) {
    error(res, 501, 'Billing is not configured on this deployment yet.');
    return;
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { rows } = await getPool().query('SELECT stripe_customer_id FROM users WHERE id = $1', [user.userId]);
  const customerId: string | null = rows[0]?.stripe_customer_id ?? null;
  if (!customerId) {
    error(res, 404, 'There is no billing account for this user yet.');
    return;
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteOrigin()}/account.html`,
    });
    json(res, 200, { url: session.url });
  } catch (err) {
    console.error('Could not open the billing portal:', err);
    error(res, 502, 'Could not open the billing portal. Try again in a moment.');
  }
}
