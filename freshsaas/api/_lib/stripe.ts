import Stripe from 'stripe';

export const PLATFORM_FEE_RATE = 0.1;

let client: Stripe | null = null;

/**
 * Returns the Stripe client, or null when STRIPE_SECRET_KEY isn't configured
 * so payment endpoints can report "not set up yet" instead of crashing.
 */
export function getStripe(): Stripe | null {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
    return client;
}

/** Fee split, computed server-side only — never trusted from a client. */
export function splitAmount(priceCents: number): { platformFeeCents: number; sellerPayoutCents: number } {
    const platformFeeCents = Math.round(priceCents * PLATFORM_FEE_RATE);
    return { platformFeeCents, sellerPayoutCents: priceCents - platformFeeCents };
}

export function siteOrigin(): string {
    return process.env.PUBLIC_SITE_URL || 'https://freshsaas.online';
}
