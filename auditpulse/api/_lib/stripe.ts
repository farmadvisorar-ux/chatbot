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

/** True for any Stripe subscription status that should unlock unlimited scanning. */
export function isActiveSubscription(status: string | null | undefined): boolean {
    return status === 'active' || status === 'trialing';
}
