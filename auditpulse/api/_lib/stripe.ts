import Stripe from 'stripe';

let client: Stripe | null = null;

/** Returns the Stripe client, or null when STRIPE_SECRET_KEY isn't configured. */
export function getStripe(): Stripe | null {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
    return client;
}

export function siteOrigin(): string {
    return process.env.PUBLIC_SITE_URL || 'https://auditpulse.example.com';
}

export type PlanId = 'audit' | 'audit_fix';

/** Both plans include unlimited audits; only audit_fix unlocks the GitHub auto-fix feature. */
export const PLAN_DETAILS: Record<PlanId, { name: string; priceCents: number }> = {
    audit: { name: 'Audit', priceCents: 700 },
    audit_fix: { name: 'Audit + Fix', priceCents: 1400 },
};

export function priceIdForPlan(plan: PlanId): string | undefined {
    return plan === 'audit_fix' ? process.env.STRIPE_PRICE_ID_AUDIT_FIX : process.env.STRIPE_PRICE_ID_AUDIT;
}

/** Reverse lookup used by the Stripe webhook to record which plan a subscription's price id corresponds to. */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PRICE_ID_AUDIT_FIX) return 'audit_fix';
    if (priceId === process.env.STRIPE_PRICE_ID_AUDIT) return 'audit';
    return null;
}

/** True for any Stripe subscription status that should unlock unlimited scanning (both plans). */
export function isActiveSubscription(status: string | null | undefined): boolean {
    return status === 'active' || status === 'trialing';
}

/** True only when the subscription is active AND on the audit_fix plan — gates the GitHub auto-fix feature. */
export function hasFixAccess(status: string | null | undefined, plan: string | null | undefined): boolean {
    return isActiveSubscription(status) && plan === 'audit_fix';
}
