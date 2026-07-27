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
        // An unverified payload must never be allowed to mark an order paid.
        error(res, 400, 'Invalid Stripe signature');
        return;
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId && session.payment_status === 'paid') {
            // Guarded on payment_state so a redelivered event can't double-apply.
            await getPool().query(
                `UPDATE marketplace_orders
                 SET payment_state = 'paid_held',
                     status = 'paid_awaiting_release',
                     stripe_payment_intent_id = $2,
                     paid_at = now()
                 WHERE id = $1 AND payment_state = 'awaiting_payment'`,
                [orderId, typeof session.payment_intent === 'string' ? session.payment_intent : null],
            );
        }
    }

    if (event.type === 'account.updated') {
        const account = event.data.object as Stripe.Account;
        await getPool().query(
            'UPDATE users SET payouts_enabled = $2 WHERE stripe_account_id = $1',
            [account.id, Boolean(account.payouts_enabled)],
        );
    }

    json(res, 200, { received: true });
}
