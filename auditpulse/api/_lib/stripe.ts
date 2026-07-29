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
export type BillingInterval = 'month' | 'year';

/**
 * Both plans include unlimited audits; only audit_fix unlocks the GitHub
 * auto-fix feature. Monthly is a recurring Stripe subscription; annual is a
 * one-time payment (not a subscription) that grants `annualDays` of access
 * via users.plan_expires_at — see checkout.ts and webhooks/stripe.ts.
 */
export const PLAN_DETAILS: Record<PlanId, { name: string; monthlyCents: number; annualCents: number }> = {
    audit: { name: 'Audit', monthlyCents: 700, annualCents: 5999 },
    audit_fix: { name: 'Audit + Fix', monthlyCents: 1400, annualCents: 9999 },
};

export function priceIdFor(plan: PlanId, interval: BillingInterval): string | undefined {
    if (interval === 'year') {
        return plan === 'audit_fix' ? process.env.STRIPE_PRICE_ID_AUDIT_FIX_ANNUAL : process.env.STRIPE_PRICE_ID_AUDIT_ANNUAL;
    }
    return plan === 'audit_fix' ? process.env.STRIPE_PRICE_ID_AUDIT_FIX : process.env.STRIPE_PRICE_ID_AUDIT;
}

/** Reverse lookup used by the Stripe webhook to record which plan a price id (monthly or annual) corresponds to. */
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PRICE_ID_AUDIT_FIX || priceId === process.env.STRIPE_PRICE_ID_AUDIT_FIX_ANNUAL) return 'audit_fix';
    if (priceId === process.env.STRIPE_PRICE_ID_AUDIT || priceId === process.env.STRIPE_PRICE_ID_AUDIT_ANNUAL) return 'audit';
    return null;
}

/** True for any Stripe subscription status that should unlock unlimited scanning (monthly plans). */
export function isActiveSubscription(status: string | null | undefined): boolean {
    return status === 'active' || status === 'trialing';
}

export interface AccessFields {
    subscription_status?: string | null;
    plan?: string | null;
    plan_expires_at?: string | Date | null;
}

/** True if access comes from either a live monthly subscription OR an unexpired annual one-time purchase. */
export function hasActiveAccess(user: AccessFields): boolean {
    if (isActiveSubscription(user.subscription_status)) return true;
    if (user.plan_expires_at && new Date(user.plan_expires_at).getTime() > Date.now()) return true;
    return false;
}

/** True only when there's active access (either billing mode) AND it's the audit_fix plan — gates the GitHub auto-fix feature. */
export function hasFixAccess(user: AccessFields): boolean {
    return hasActiveAccess(user) && user.plan === 'audit_fix';
}
