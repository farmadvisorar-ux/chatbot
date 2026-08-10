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

/**
 * Absolute origin used for Stripe success/cancel redirects.
 * Prefer PUBLIC_SITE_URL; fall back to the current Vercel deployment host so
 * preview URLs don't bounce shoppers to production; last resort is local Vite.
 */
export function siteOrigin(): string {
    const configured = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
    if (configured) return configured;

    const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, '');
    if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`;

    return 'http://localhost:5173';
}

export function shippingFlatCents(): number {
    return Math.max(0, Math.trunc(Number(process.env.SHIPPING_FLAT_CENTS) || 500));
}
