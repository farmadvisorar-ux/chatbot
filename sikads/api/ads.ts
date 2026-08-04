import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { json, requireMethod, clientKey } from './_lib/http.js';
import { clean, validEmail, validUrl } from './_lib/validate.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { getStripe, siteOrigin } from './_lib/stripe.js';
import { MIN_CPM_CENTS, MAX_CPM_CENTS, MIN_BUDGET_CENTS, MAX_BUDGET_CENTS, computeViews } from './_lib/pricing.js';

/**
 * Serves one ad into the Sponsored slot and counts it as a view in the same
 * query. The pick is weighted random, not uniform: an advertiser paying a
 * higher price per 1,000 views should rotate in more often, the same way a
 * real ad auction favours the higher bid.
 *
 * Implementation is the Efraimidis-Spirakis trick for weighted sampling:
 * for each candidate draw key = -ln(U) / weight (U uniform on (0,1]) and take
 * the smallest key. A campaign with double the cpm is, in expectation, twice
 * as likely to produce the smallest key. Doing the pick and the decrement in
 * one UPDATE keeps it atomic under concurrent requests — no two visitors can
 * both grab the last remaining view of a campaign.
 */
async function handleServe(res: VercelResponse): Promise<void> {
    const { rows } = await getPool().query(
        `WITH candidate AS (
             SELECT id FROM ad_campaigns
             WHERE status = 'live' AND views_remaining > 0
             ORDER BY -ln(GREATEST(random(), 0.0000001)) / cpm_cents ASC
             LIMIT 1
         )
         UPDATE ad_campaigns
         SET views_remaining = views_remaining - 1,
             status = CASE WHEN views_remaining - 1 <= 0 THEN 'exhausted' ELSE status END
         FROM candidate
         WHERE ad_campaigns.id = candidate.id
         RETURNING ad_campaigns.id, headline, url`,
    );
    json(res, 200, { ad: rows[0] ?? null });
}

/**
 * Starts a self-serve ad purchase. Unlike a fixed-package flow, the price is
 * whatever the advertiser sets (cpm_cents), so the only thing validated
 * server-side is that it falls inside sane bounds — the exact number is
 * theirs to choose, and it's what actually gets charged via Stripe.
 */
async function handleCheckout(req: VercelRequest, res: VercelResponse): Promise<void> {
    const pool = getPool();

    if (!(await checkRateLimit(pool, 'ad-checkout', clientKey(req), 5, 60))) {
        json(res, 429, { error: 'Too many ad submissions from this network. Try again later.' });
        return;
    }

    const stripe = getStripe();
    if (!stripe) {
        json(res, 501, { error: 'Ad purchases are not open yet. Check back shortly.' });
        return;
    }

    const body = (req.body || {}) as { headline?: string; url?: string; email?: string; budgetCents?: number; cpmCents?: number };
    const headline = clean(body.headline, 140);
    const url = clean(body.url, 2048);
    const email = clean(body.email, 254).toLowerCase();
    const budgetCents = Math.round(Number(body.budgetCents));
    const cpmCents = Math.round(Number(body.cpmCents));

    if (!headline || !url || !email) {
        json(res, 400, { error: 'A one-line pitch, a link, and your email are required' });
        return;
    }
    if (!validEmail(email)) {
        json(res, 400, { error: 'Enter a valid email' });
        return;
    }
    if (!validUrl(url)) {
        json(res, 400, { error: 'Enter a valid URL, starting with http:// or https://' });
        return;
    }
    if (!Number.isFinite(cpmCents) || cpmCents < MIN_CPM_CENTS || cpmCents > MAX_CPM_CENTS) {
        json(res, 400, { error: `Price per 1,000 views must be between $${(MIN_CPM_CENTS / 100).toFixed(2)} and $${(MAX_CPM_CENTS / 100).toFixed(2)}` });
        return;
    }
    if (!Number.isFinite(budgetCents) || budgetCents < MIN_BUDGET_CENTS || budgetCents > MAX_BUDGET_CENTS) {
        json(res, 400, { error: `Budget must be between $${(MIN_BUDGET_CENTS / 100).toFixed(2)} and $${(MAX_BUDGET_CENTS / 100).toFixed(2)}` });
        return;
    }

    const views = computeViews(budgetCents, cpmCents);
    if (views < 1) {
        json(res, 400, { error: 'That budget and price combination does not buy any views' });
        return;
    }

    const inserted = await pool.query(
        `INSERT INTO ad_campaigns (advertiser_email, headline, url, cpm_cents, budget_cents, views_purchased, views_remaining, status)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 'awaiting_payment') RETURNING id`,
        [email, headline, url, cpmCents, budgetCents, views],
    );
    const adId = inserted.rows[0]?.id;
    if (!adId) {
        json(res, 500, { error: 'Could not save the campaign' });
        return;
    }

    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: budgetCents,
                product_data: {
                    name: `Sikads campaign — ${views.toLocaleString()} views at $${(cpmCents / 100).toFixed(2)}/1,000`,
                    description: headline,
                },
            },
        }],
        // adCampaignId travels with the session so the webhook can match the
        // payment back to our row without trusting anything from the browser.
        metadata: { adCampaignId: adId },
        success_url: `${siteOrigin()}/?ad=success`,
        cancel_url: `${siteOrigin()}/?ad=cancelled`,
    });

    await pool.query('UPDATE ad_campaigns SET stripe_session_id = $2 WHERE id = $1', [adId, session.id]);

    json(res, 200, { ok: true, adId, checkoutUrl: session.url });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method === 'POST') {
        if (req.query.action === 'checkout') {
            await handleCheckout(req, res);
            return;
        }
        json(res, 400, { error: "Unknown action. Use ?action=checkout" });
        return;
    }
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    await handleServe(res);
}
