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
        // An unverified payload must never be allowed to mark a campaign paid.
        error(res, 400, 'Invalid Stripe signature');
        return;
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const adCampaignId = session.metadata?.adCampaignId;
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;

        if (adCampaignId && session.payment_status === 'paid') {
            // Paid campaigns still land in pending_review, not live: a scam or
            // NSFW link must not be able to buy its way onto the site
            // unreviewed. Guarded on status so a redelivered event can't
            // double-apply.
            await getPool().query(
                `UPDATE ad_campaigns
                 SET status = 'pending_review', stripe_payment_intent_id = $2, paid_at = now()
                 WHERE id = $1 AND status = 'awaiting_payment'`,
                [adCampaignId, paymentIntentId],
            );
        }
    }

    json(res, 200, { received: true });
}
