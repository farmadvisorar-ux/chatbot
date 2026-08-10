import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, requireMethod, clientKey } from './_lib/http.js';
import { clean, validEmail, validHttpsUrl, validUrl } from './_lib/validate.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { getStripe, siteOrigin } from './_lib/stripe.js';
import { CERTIFICATION_FEE_CENTS, isCategory } from './_lib/pricing.js';

/**
 * Public directory. Only ever returns `status = 'certified'` rows — a paid
 * but unreviewed submission must never appear as if it passed review.
 */
async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!isDatabaseConfigured()) {
        json(res, 200, { apps: [] });
        return;
    }

    const category = typeof req.query.category === 'string' ? clean(req.query.category, 32) : '';
    const q = typeof req.query.q === 'string' ? clean(req.query.q, 80) : '';

    const conditions: string[] = [`status = 'certified'`];
    const params: unknown[] = [];
    if (category && isCategory(category)) {
        params.push(category);
        conditions.push(`category = $${params.length}`);
    }
    if (q) {
        params.push(`%${q}%`);
        conditions.push(`(name ILIKE $${params.length} OR tagline ILIKE $${params.length})`);
    }

    const { rows } = await getPool().query(
        `SELECT id, name, tagline, category, description, icon_url AS "iconUrl",
                store_url AS "storeUrl", certified_at AS "certifiedAt"
         FROM apps WHERE ${conditions.join(' AND ')}
         ORDER BY certified_at DESC LIMIT 200`,
        params,
    );
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    json(res, 200, { apps: rows });
}

/** Counts behind the landing page's live proof numbers. */
async function handleStats(res: VercelResponse): Promise<void> {
    if (!isDatabaseConfigured()) {
        json(res, 200, { total: 0, byCategory: {}, feeCents: CERTIFICATION_FEE_CENTS, configured: false });
        return;
    }

    const { rows } = await getPool().query(
        `SELECT category, count(*)::int AS count FROM apps WHERE status = 'certified' GROUP BY category`,
    );
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
        byCategory[row.category] = row.count;
        total += row.count;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    json(res, 200, { total, byCategory, feeCents: CERTIFICATION_FEE_CENTS });
}

/**
 * Starts a developer's certification: the app is saved as `awaiting_payment`
 * and a Stripe Checkout Session is opened for the flat fee. The webhook is
 * what actually moves it to `pending_review` once Stripe confirms payment —
 * this endpoint never marks anything paid on its own.
 */
async function handleSubmit(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!isDatabaseConfigured()) {
        json(res, 501, { error: 'Submissions are not open yet. Check back shortly.' });
        return;
    }
    const pool = getPool();

    if (!(await checkRateLimit(pool, 'app-submit', clientKey(req), 5, 60))) {
        json(res, 429, { error: 'Too many submissions from this network. Try again later.' });
        return;
    }

    const stripe = getStripe();
    if (!stripe) {
        json(res, 501, { error: 'Submissions are not open yet. Check back shortly.' });
        return;
    }

    const body = (req.body || {}) as {
        name?: string; tagline?: string; category?: string; description?: string;
        iconUrl?: string; storeUrl?: string; email?: string;
    };
    const name = clean(body.name, 80);
    const tagline = clean(body.tagline, 140);
    const category = clean(body.category, 32);
    const description = clean(body.description, 600);
    const iconUrl = clean(body.iconUrl, 2048);
    const storeUrl = clean(body.storeUrl, 2048);
    const email = clean(body.email, 254).toLowerCase();

    if (!name || !tagline || !description || !email) {
        json(res, 400, { error: 'App name, one-line pitch, description, and your email are all required' });
        return;
    }
    if (!isCategory(category)) {
        json(res, 400, { error: 'Choose which dashboard category the app belongs in' });
        return;
    }
    if (!validEmail(email)) {
        json(res, 400, { error: 'Enter a valid email' });
        return;
    }
    if (!validHttpsUrl(iconUrl)) {
        json(res, 400, { error: 'Enter a secure icon URL, starting with https://' });
        return;
    }
    if (!validUrl(storeUrl)) {
        json(res, 400, { error: 'Enter a valid link to the app (store listing or download page)' });
        return;
    }

    const inserted = await pool.query(
        `INSERT INTO apps (developer_email, name, tagline, category, description, icon_url, store_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'awaiting_payment') RETURNING id`,
        [email, name, tagline, category, description, iconUrl, storeUrl],
    );
    const appId = inserted.rows[0]?.id;
    if (!appId) {
        json(res, 500, { error: 'Could not save the submission' });
        return;
    }

    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: CERTIFICATION_FEE_CENTS,
                product_data: {
                    name: `AutoPassport certification — ${name}`,
                    description: tagline,
                },
            },
        }],
        // appId travels with the session so the webhook can match the payment
        // back to our row without trusting anything from the browser.
        metadata: { appId },
        payment_intent_data: { statement_descriptor_suffix: 'AUTOPASSPORT' },
        success_url: `${siteOrigin()}/?submit=success`,
        cancel_url: `${siteOrigin()}/?submit=cancelled`,
    });

    await pool.query('UPDATE apps SET stripe_session_id = $2 WHERE id = $1', [appId, session.id]);

    json(res, 200, { ok: true, appId, checkoutUrl: session.url });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method === 'POST') {
        if (req.query.action === 'submit') {
            await handleSubmit(req, res);
            return;
        }
        json(res, 400, { error: 'Unknown action. Use ?action=submit' });
        return;
    }
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    if (req.query.view === 'stats') {
        await handleStats(res);
        return;
    }
    await handleList(req, res);
}
