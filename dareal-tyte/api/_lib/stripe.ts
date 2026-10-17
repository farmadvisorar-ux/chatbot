import Stripe from 'stripe';

let client: Stripe | null = null;

/** Returns null when STRIPE_SECRET_KEY isn't configured, so callers can report "not set up yet" instead of crashing. */
export function getStripe(): Stripe | null {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
    return client;
}

export function siteOrigin(): string {
    return process.env.PUBLIC_SITE_URL || 'https://darealtyte.com';
}

export const ACCESS_DURATION_MS = 1000 * 60 * 60 * 24 * 30 * 6; // ~6 months
