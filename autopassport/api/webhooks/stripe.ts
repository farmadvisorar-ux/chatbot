import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { getStripe } from '../_lib/stripe.js';

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
        // An unverified payload must never be allowed to mark a submission paid.
        error(res, 400, 'Invalid Stripe signature');
        return;
    }

    // completed fires once the form is submitted, which for delayed payment
    // methods (e.g. bank debits) can still be unpaid; async_payment_succeeded
    // is Stripe's later confirmation that the money actually arrived. Both
    // carry the same session shape, so both go through the same guarded update.
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as Stripe.Checkout.Session;
        const appId = session.metadata?.appId;
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;

        if (appId && session.payment_status === 'paid') {
            // Paid submissions still land in pending_review, not certified: a
            // fee only buys a review, not a stamp. Guarded on status so a
            // redelivered webhook event can't double-apply.
            await getPool().query(
                `UPDATE apps
                 SET status = 'pending_review', stripe_payment_intent_id = $2, paid_at = now()
                 WHERE id = $1 AND status = 'awaiting_payment'`,
                [appId, paymentIntentId],
            );
        }
    }

    json(res, 200, { received: true });
}
