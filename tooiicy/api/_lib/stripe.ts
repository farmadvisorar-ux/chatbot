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
 * Prefer an explicit PUBLIC_SITE_URL; fall back to Vercel hostnames so preview
 * deployments don't send shoppers to the wrong domain.
 */
export function siteOrigin(): string {
    const configured = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
    if (configured) return configured;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '')}`;
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
    }
    return 'http://localhost:5173';
}

/** Flat shipping (cents) charged at checkout — same value the cart UI should show. */
export function shippingFlatCents(): number {
    return Math.max(0, Math.trunc(Number(process.env.SHIPPING_FLAT_CENTS) || 500));
}

type ShippingDetails = {
    name?: string | null;
    address?: Stripe.Address | null;
} | null | undefined;

/**
 * Stripe Checkout shipping lives on `collected_information.shipping_details`
 * in current API versions (legacy `shipping_details` was removed). Read both
 * so paid orders still reach Printful with an address.
 */
export function sessionShippingDetails(session: Stripe.Checkout.Session): ShippingDetails {
    const collected = (session as Stripe.Checkout.Session & {
        collected_information?: { shipping_details?: ShippingDetails };
    }).collected_information?.shipping_details;
    if (collected) return collected;
    return (session as Stripe.Checkout.Session & { shipping_details?: ShippingDetails }).shipping_details;
}
