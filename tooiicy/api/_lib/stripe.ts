import Stripe from 'stripe';

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

export function siteOrigin(): string {
    return process.env.PUBLIC_SITE_URL || 'https://tooiicy.com';
}
