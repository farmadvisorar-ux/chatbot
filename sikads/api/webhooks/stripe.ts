import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { getPool } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { getStripe } from '../_lib/stripe.js';

// Signature verification needs the exact bytes Stripe signed, so the parsed
// body must be disabled here.
export const config = { api: { bodyParser: false } };

/**
 * Prefer a body Vercel already buffered (Buffer/string) before falling back to
 * the request stream. If the platform had already JSON-parsed the body, the
 * original bytes are gone and signature verification cannot succeed — fail
 * closed rather than activating a campaign on an unverifiable payload.
 */
function readRawBody(req: VercelRequest): Promise<Buffer> {
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body as object).length > 0) {
        return Promise.reject(new Error('Request body was already parsed; cannot verify Stripe signature'));
    }
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer | string) => {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function activatePaidCampaign(session: Stripe.Checkout.Session): Promise<void> {
    const adCampaignId = session.metadata?.adCampaignId;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
    const amountTotal = session.amount_total;
    if (!adCampaignId || session.payment_status !== 'paid') return;
    if (typeof amountTotal !== 'number' || amountTotal <= 0) return;
    if (session.currency && session.currency !== 'usd') return;

    // Bind the charged amount (and session id when already stored) so a forged
    // or mismatched Checkout Session cannot flip someone else's campaign paid.
    // stripe_session_id may still be null if the webhook races the post-create
    // UPDATE in checkout — accept null once, then stamp the session id here.
    await getPool().query(
        `UPDATE ad_campaigns
         SET status = 'pending_review',
             stripe_payment_intent_id = $2,
             stripe_session_id = COALESCE(stripe_session_id, $4),
             paid_at = now()
         WHERE id = $1
           AND status = 'awaiting_payment'
           AND budget_cents = $3
           AND (stripe_session_id IS NULL OR stripe_session_id = $4)`,
        [adCampaignId, paymentIntentId, amountTotal, session.id],
    );
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

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        // Paid campaigns still land in pending_review, not live: a scam or
        // NSFW link must not be able to buy its way onto the site
        // unreviewed. Guarded on status so a redelivered event can't
        // double-apply.
        await activatePaidCampaign(event.data.object as Stripe.Checkout.Session);
    }

    json(res, 200, { received: true });
}
