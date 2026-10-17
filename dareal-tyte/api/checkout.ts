import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, error, requireMethod } from './_lib/http.js';
import { requireSignedIn } from './_lib/auth.js';
import { getStripe, siteOrigin } from './_lib/stripe.js';

/**
 * POST /api/checkout
 * Creates a one-time $18 Stripe Checkout session for the signed-in user.
 * Deliberately doesn't require existing paid access (that's the point —
 * this is how you get it), just a signed-in Clerk session so the webhook
 * has a user to credit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const user = await requireSignedIn(req, res);
    if (!user) return;

    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!stripe || !priceId) {
        error(res, 501, 'Billing is not configured on this deployment yet.');
        return;
    }

    try {
        const origin = siteOrigin();
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: user.email,
            client_reference_id: user.userId,
            metadata: { clerkUserId: user.userId },
            success_url: `${origin}/admin.html?purchase=success`,
            cancel_url: `${origin}/admin.html?purchase=cancelled`,
            // This Stripe account has Managed Payments (automatic tax) on by
            // default, which requires every product to carry a tax code —
            // otherwise session creation fails outright. Opting out here
            // rather than guessing a tax classification; the installed SDK
            // version predates this param's types, hence the cast. Revisit
            // if the business wants Stripe to handle sales tax collection.
            ...({ managed_payments: { enabled: false } } as object),
        });

        if (!session.url) {
            error(res, 502, 'Stripe did not return a checkout URL.');
            return;
        }
        json(res, 200, { url: session.url });
    } catch (err) {
        console.error('checkout: unexpected failure', err);
        error(res, 502, 'Could not start checkout.');
    }
}
