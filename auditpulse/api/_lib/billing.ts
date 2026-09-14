import Stripe from 'stripe';
import type { TierSlug } from './tier.js';

/**
 * The tiers that can actually be bought.
 *
 * Deliberately only the ones whose features are built. Team, Studio and
 * Agency are published on the pricing page as "Coming soon" and are absent
 * here, so there is no code path that can take money for them — the release
 * policy in tiers.md is enforced by this object's shape rather than by
 * remembering to keep a flag in sync.
 */
export const PURCHASABLE: Record<string, { slug: TierSlug; name: string; amountCents: number; blurb: string }> = {
    starter: { slug: 'starter', name: 'Starter', amountCents: 500, blurb: 'Daily re-audits, instant new-issue alerts, certificate expiry warnings, 25-page crawl.' },
    plus: { slug: 'plus', name: 'Plus', amountCents: 900, blurb: 'Change and new-subdomain alerts, 90-day trend chart, 100-page crawl.' },
    growth: { slug: 'growth', name: 'Growth', amountCents: 1400, blurb: 'Slack/Discord/webhook alerts, REST API, CI gate, hourly re-audits, CSV and JSON export.' },
};

/**
 * The stable handle for a tier's Stripe Price.
 *
 * Everything is addressed through this rather than through a price id pasted
 * into an environment variable: lookup keys survive a price being archived
 * and replaced, they make the webhook able to derive the tier from whatever
 * price a subscription actually carries (including one the customer switched
 * to inside the billing portal), and they mean a fresh Stripe account needs
 * no dashboard setup at all — see ensurePrice.
 */
export const lookupKey = (slug: string): string => `auditpulse_${slug}_monthly`;

export function tierFromLookupKey(key: string | null | undefined): TierSlug | null {
    if (!key) return null;
    const match = /^auditpulse_([a-z]+)_monthly$/.exec(key);
    const slug = match?.[1];
    return slug && PURCHASABLE[slug] ? PURCHASABLE[slug].slug : null;
}

/** True once a secret key is present. The pricing page reads this, so an unconfigured deployment shows "Coming soon" instead of a button that 501s. */
export function billingConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

export function stripeClient(): Stripe | null {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return null;
    if (!client) client = new Stripe(secretKey);
    return client;
}

/**
 * The Price id for a tier, creating the Product and Price on first use.
 *
 * Self-provisioning on purpose. The alternative — create six products by hand
 * in the dashboard, paste six ids into environment variables, keep them in
 * sync across preview and production — is the step most likely to be done
 * wrong, and it fails at the worst moment: a customer clicking Buy. Here the
 * first checkout for a tier creates what it needs, and every checkout after
 * that finds it by lookup key.
 *
 * Prices are immutable in Stripe, so changing what a tier costs means
 * archiving the old price and creating a new one. This will keep returning
 * the existing active price for its lookup key until someone does that, which
 * is the safe direction: it can never silently re-price an existing customer.
 */
export async function ensurePrice(stripe: Stripe, slug: string): Promise<string> {
    const tier = PURCHASABLE[slug];
    if (!tier) throw new Error(`${slug} is not a purchasable tier.`);
    const key = lookupKey(slug);

    const existing = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    if (existing.data[0]) return existing.data[0].id;

    const product = await stripe.products.create({
        name: `AuditPulse ${tier.name}`,
        description: tier.blurb,
        metadata: { auditpulse_tier: tier.slug },
    });
    const price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: tier.amountCents,
        recurring: { interval: 'month' },
        lookup_key: key,
        metadata: { auditpulse_tier: tier.slug },
    });
    return price.id;
}

/**
 * Which tier a Stripe subscription entitles the account to, or 'free'.
 *
 * Derived from the price the subscription actually carries rather than from
 * metadata written at checkout, so a customer who upgrades or downgrades
 * inside Stripe's billing portal lands on the right tier without us having to
 * intercept that flow.
 *
 * `past_due` deliberately keeps the paid tier. Stripe retries a failed
 * payment for days before giving up, and cutting off monitoring the hour a
 * card expires means the alert someone is paying for goes missing during the
 * window they are least likely to be watching email. Stripe sends
 * `customer.subscription.deleted` when it finally gives up, and that is when
 * access ends.
 */
export function tierForSubscription(subscription: Stripe.Subscription): TierSlug {
    const entitled = subscription.status === 'active'
        || subscription.status === 'trialing'
        || subscription.status === 'past_due';
    if (!entitled) return 'free';

    for (const item of subscription.items.data) {
        const tier = tierFromLookupKey(item.price.lookup_key);
        if (tier) return tier;
    }
    return 'free';
}
