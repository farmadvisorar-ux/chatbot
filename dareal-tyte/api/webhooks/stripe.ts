import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { createClerkClient } from '@clerk/backend';
import { json, error, requireMethod } from '../_lib/http.js';
import { getStripe, ACCESS_DURATION_MS } from '../_lib/stripe.js';

// Signature verification needs the exact bytes Stripe signed, so the parsed
// body must be disabled here.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!stripe || !webhookSecret || !clerkSecretKey) {
        error(res, 501, 'Stripe webhook is not configured.');
        return;
    }

    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
        error(res, 400, 'Missing Stripe signature.');
        return;
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(await readRawBody(req), signature, webhookSecret);
    } catch {
        // An unverified payload must never be allowed to grant access.
        error(res, 400, 'Invalid Stripe signature.');
        return;
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const clerkUserId = session.metadata?.clerkUserId ?? session.client_reference_id;

        if (clerkUserId && session.payment_status === 'paid') {
            const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
            const user = await clerkClient.users.getUser(clerkUserId);

            // A redelivered webhook for the same session must not re-extend
            // access by another 6 months on top of what it already granted.
            if (user.privateMetadata?.lastPaidSessionId !== session.id) {
                await clerkClient.users.updateUserMetadata(clerkUserId, {
                    privateMetadata: {
                        accessExpiresAt: Date.now() + ACCESS_DURATION_MS,
                        lastPaidSessionId: session.id,
                    },
                });
            }
        }
    }

    json(res, 200, { received: true });
}
