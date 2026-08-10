import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { getStripe } from '../_lib/stripe.js';
import { submitToPrintful } from '../_lib/fulfillment.js';

// Signature verification needs the exact bytes Stripe signed, so the parsed
// body must be disabled here.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

type ShippingDetails = { name?: string | null; address?: Stripe.Address | null } | null | undefined;

/**
 * Stripe moved Checkout shipping off the top-level `shipping_details` field
 * (removed in API 2025-03-31.basil) onto `collected_information.shipping_details`.
 * Read the new path first and fall back for older event payloads.
 */
function sessionShipping(session: Stripe.Checkout.Session): ShippingDetails {
    const collected = (session as Stripe.Checkout.Session & {
        collected_information?: { shipping_details?: ShippingDetails };
    }).collected_information?.shipping_details;
    if (collected) return collected;

    return (session as Stripe.Checkout.Session & {
        shipping_details?: ShippingDetails;
    }).shipping_details;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
        error(res, 501, 'Stripe webhook is not configured');
        return;
    }

    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
        error(res, 400, 'Missing Stripe signature');
        return;
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(await readRawBody(req), signature, secret);
    } catch {
        // An unverified payload must never be allowed to mark an order paid.
        error(res, 400, 'Invalid Stripe signature');
        return;
    }

    const pool = getPool();

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
        const shippingDetails = sessionShipping(session);

        if (orderId && session.payment_status === 'paid') {
            // Guarded on status so a redelivered event can't submit the same
            // order to Printful twice.
            const { rowCount } = await pool.query(
                `UPDATE orders
                 SET status = 'paid', stripe_payment_intent_id = $2, paid_at = now(),
                     email = COALESCE(email, $3), shipping_name = $4, shipping_address = $5
                 WHERE id = $1 AND status = 'awaiting_payment'`,
                [
                    orderId,
                    paymentIntentId,
                    session.customer_details?.email || null,
                    shippingDetails?.name || null,
                    shippingDetails?.address ? JSON.stringify(shippingDetails.address) : null,
                ],
            );
            if (rowCount) await submitToPrintful(pool, orderId);
        }
    }

    if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId) {
            await pool.query(
                `UPDATE orders SET status = 'cancelled'
                 WHERE id = $1 AND status = 'awaiting_payment'`,
                [orderId],
            );
        }
    }

    json(res, 200, { received: true });
}
