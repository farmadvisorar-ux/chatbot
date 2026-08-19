import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { json, requireMethod, clientKey } from './_lib/http.js';
import { clean, validEmail, validUrl } from './_lib/validate.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { getStripe, siteOrigin } from './_lib/stripe.js';
import { AD_PACKAGES } from './_lib/ads.js';

const ACCENTS = ['#c9ff57', '#7ac7ff', '#ff7d66', '#ffd36a', '#90e0c1', '#c9b7ff', '#ffb7a7', '#bde58d'];

const initialsOf = (name: string): string =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '??';

/** Relative age, matching how the static catalog labels its entries. */
function launchedLabel(discoveredAt: string): string {
    const hours = (Date.now() - new Date(discoveredAt).getTime()) / 36e5;
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(discoveredAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

const EVENT_TYPES = new Set(['pageview', 'listing_click', 'search', 'outbound', 'signup_open', 'submit_open', 'marketplace_view', 'ad_click']);

/**
 * Records one analytics event. Lives on this endpoint rather than its own
 * because the project sits at Vercel's 12-function Hobby cap; this is already
 * the public, unauthenticated data route for the directory.
 *
 * Stores no IP address and sets no cookie — country comes from Vercel's edge
 * header and the session id is a random per-tab value from the client.
 */
async function recordEvent(req: VercelRequest, res: VercelResponse): Promise<void> {
    const body = (req.body || {}) as Record<string, unknown>;
    const type = String(body.type ?? '');
    if (!EVENT_TYPES.has(type)) {
        json(res, 400, { error: 'Unknown event type' });
        return;
    }

    const str = (value: unknown, max: number): string | null =>
        typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

    let referrerHost: string | null = null;
    const referrer = str(body.referrer, 500);
    if (referrer) {
        try { referrerHost = new URL(referrer).hostname.replace(/^www\./, ''); } catch { referrerHost = null; }
    }

    const userAgent = String(req.headers['user-agent'] ?? '');
    const device = /mobile|iphone|android/i.test(userAgent) ? 'mobile'
        : /ipad|tablet/i.test(userAgent) ? 'tablet' : 'desktop';

    const entryId = str(body.entryId, 64);
    await getPool().query(
        `INSERT INTO analytics_events (type, path, referrer_host, country, device, session_id, entry_id, label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            type,
            str(body.path, 300) ?? '/',
            referrerHost,
            str(req.headers['x-vercel-ip-country'], 4),
            device,
            str(body.sessionId, 64),
            entryId && /^[0-9a-f-]{36}$/i.test(entryId) ? entryId : null,
            str(body.label, 200),
        ],
    );
    json(res, 202, { ok: true });
}


/**
 * Records or withdraws an upvote.
 *
 * Anonymous: the voter key is a random value the browser keeps in
 * localStorage, so voting needs no account. A primary key on
 * (entry_id, voter_key) is what actually enforces one vote per visitor —
 * the count on directory_entries is only a cache of that table.
 */
async function handleVote(req: VercelRequest, res: VercelResponse): Promise<void> {
    const body = (req.body || {}) as { entryId?: string; voterKey?: string; withdraw?: boolean };
    const entryId = String(body.entryId ?? '').replace(/^db-/, '');
    const voterKey = String(body.voterKey ?? '').slice(0, 64);

    if (!/^[0-9a-f-]{36}$/i.test(entryId) || voterKey.length < 8) {
        json(res, 400, { error: 'Invalid vote' });
        return;
    }

    const pool = getPool();
    if (body.withdraw) {
        const removed = await pool.query('DELETE FROM directory_votes WHERE entry_id = $1 AND voter_key = $2', [entryId, voterKey]);
        if (removed.rowCount) {
            // GREATEST guards against the counter going negative if a row is
            // ever removed without the entry being decremented.
            await pool.query('UPDATE directory_entries SET votes = GREATEST(0, votes - 1) WHERE id = $1', [entryId]);
        }
    } else {
        const added = await pool.query(
            'INSERT INTO directory_votes (entry_id, voter_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [entryId, voterKey],
        );
        if (added.rowCount) {
            await pool.query('UPDATE directory_entries SET votes = votes + 1 WHERE id = $1', [entryId]);
        }
    }

    const { rows } = await pool.query('SELECT votes FROM directory_entries WHERE id = $1', [entryId]);
    if (!rows[0]) {
        json(res, 404, { error: 'Listing not found' });
        return;
    }
    json(res, 200, { ok: true, votes: rows[0].votes, voted: !body.withdraw });
}

/**
 * Starts a self-serve ad purchase: an advertiser buys a package of views for
 * a one-line pitch that links out to their own site. Lives here rather than
 * its own function for the same 12-function-cap reason as the rest of this
 * file. The Stripe Checkout Session, not the request body, is what a client
 * could otherwise try to under-pay through — price always comes from
 * AD_PACKAGES, keyed by a package code the client sends.
 */
async function handleAdCheckout(req: VercelRequest, res: VercelResponse): Promise<void> {
    const pool = getPool();

    if (!(await checkRateLimit(pool, 'ad-checkout', clientKey(req), 5, 60))) {
        json(res, 429, { error: 'Too many ad submissions from this network. Try again later.' });
        return;
    }

    const stripe = getStripe();
    if (!stripe) {
        json(res, 501, { error: 'Ad purchases are not open yet. Join the launch list and we will let you know the moment they are.' });
        return;
    }

    const body = (req.body || {}) as { headline?: string; url?: string; email?: string; pack?: string };
    const headline = clean(body.headline, 140);
    const url = clean(body.url, 2048);
    const email = clean(body.email, 254).toLowerCase();
    const pack = AD_PACKAGES[clean(body.pack, 20)];

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
    if (!pack) {
        json(res, 400, { error: 'Choose a view package' });
        return;
    }

    const inserted = await pool.query(
        `INSERT INTO ad_campaigns (advertiser_email, headline, url, views_purchased, views_remaining, price_cents, status)
         VALUES ($1, $2, $3, $4, $4, $5, 'awaiting_payment') RETURNING id`,
        [email, headline, url, pack.views, pack.priceCents],
    );
    const adId = inserted.rows[0]?.id;
    if (!adId) {
        json(res, 500, { error: 'Could not save the ad' });
        return;
    }

    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: pack.priceCents,
                product_data: { name: `FreshSAAS ad — ${pack.label}`, description: headline },
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

/**
 * Records one ad impression and decrements the campaign's remaining view
 * balance. The UPDATE's WHERE clause (status='live' AND views_remaining>0)
 * is what makes this atomic and self-limiting: a campaign flips to
 * 'exhausted' the moment it hits zero and no later request can push it
 * negative, even under concurrent traffic.
 *
 * Best-effort like the rest of this app's anonymous tracking: nothing here
 * stops a bad actor from replaying requests to burn through someone else's
 * purchased views, beyond the per-IP rate limit below. Worth a CAPTCHA or a
 * signed per-pageview token if that becomes a real problem at scale.
 */
async function handleAdImpression(req: VercelRequest, res: VercelResponse): Promise<void> {
    const pool = getPool();

    if (!(await checkRateLimit(pool, 'ad-impression', clientKey(req), 120, 1))) {
        json(res, 429, { error: 'Too many impressions from this network' });
        return;
    }

    const adId = clean((req.body as { adId?: string } | undefined)?.adId, 64);
    if (!/^[0-9a-f-]{36}$/i.test(adId)) {
        json(res, 400, { error: 'Invalid ad id' });
        return;
    }

    const { rows } = await pool.query(
        `UPDATE ad_campaigns
         SET views_remaining = views_remaining - 1,
             status = CASE WHEN views_remaining - 1 <= 0 THEN 'exhausted' ELSE status END
         WHERE id = $1 AND status = 'live' AND views_remaining > 0
         RETURNING views_remaining`,
        [adId],
    );
    json(res, 200, { ok: true, viewsRemaining: rows[0]?.views_remaining ?? 0 });
}

/** Live ads with views left to serve, for the sponsored slot on the site. */
async function sendAds(res: VercelResponse): Promise<void> {
    const { rows } = await getPool().query(
        `SELECT id, headline, url FROM ad_campaigns
         WHERE status = 'live' AND views_remaining > 0
         ORDER BY random() LIMIT 20`,
    );
    json(res, 200, { ads: rows });
}

/**
 * Published Insights articles.
 *
 * Also served from this endpoint for the 12-function reason above. Each link
 * resolves to its affiliate URL when the operator has set one; `sponsored`
 * tells the client to mark the link up correctly and show the disclosure.
 */
async function sendInsights(req: VercelRequest, res: VercelResponse): Promise<void> {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
    const { rows } = slug
        ? await getPool().query(
            `SELECT slug, title, keyword, meta_description, category, excerpt, body_html, links,
                    read_minutes, updated_at, disclosure
             FROM insight_articles WHERE published AND slug = $1`, [slug])
        : await getPool().query(
            `SELECT slug, title, keyword, meta_description, category, excerpt, body_html, links,
                    read_minutes, updated_at, disclosure
             FROM insight_articles WHERE published ORDER BY rank ASC, created_at ASC`);

    json(res, 200, {
        articles: rows.map(row => ({
            slug: row.slug,
            title: row.title,
            keyword: row.keyword,
            metaDescription: row.meta_description,
            category: row.category,
            excerpt: row.excerpt,
            bodyHtml: row.body_html,
            readMinutes: row.read_minutes,
            updatedAt: row.updated_at,
            disclosure: row.disclosure ?? null,
            links: (row.links || []).map((link: { name: string; url: string; note?: string; affiliateUrl?: string | null }) => ({
                name: link.name,
                note: link.note ?? '',
                url: link.affiliateUrl || link.url,
                sponsored: Boolean(link.affiliateUrl),
            })),
        })),
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method === 'POST') {
        if (req.query.action === 'vote') {
            await handleVote(req, res);
            return;
        }
        if (req.query.action === 'ad-checkout') {
            await handleAdCheckout(req, res);
            return;
        }
        if (req.query.action === 'ad-impression') {
            await handleAdImpression(req, res);
            return;
        }
        await recordEvent(req, res);
        return;
    }
    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    if (req.query.view === 'insights') {
        await sendInsights(req, res);
        return;
    }
    if (req.query.view === 'ads') {
        await sendAds(res);
        return;
    }

    const { rows } = await getPool().query(
        `SELECT id, name, tagline, description, url, category, tags, source, source_url,
                discovered_at, featured, featured_rank, votes
         FROM directory_entries WHERE status = 'live'
         ORDER BY featured DESC, featured_rank ASC, discovered_at DESC LIMIT 500`,
    );

    // Shaped to match the frontend Product type so it merges with the static
    // catalog without any per-source special casing in the UI.
    const launches = rows.map((row, index) => {
        const ageHours = (Date.now() - new Date(row.discovered_at).getTime()) / 36e5;
        return {
            id: `db-${row.id}`,
            name: row.name,
            initials: initialsOf(row.name),
            category: row.category,
            tagline: row.tagline,
            description: row.description,
            audience: `${row.category} teams, founders and early adopters`,
            pricing: 'See launch page',
            launched: launchedLabel(row.discovered_at),
            // Raw timestamp as well as the label: the client groups the feed
            // into Today / Yesterday / This week, which a label cannot drive.
            discoveredAt: new Date(row.discovered_at).toISOString(),
            votes: row.votes ?? 0,
            featured: Boolean(row.featured),
            // Featured entries sit above the freshness sort so a hand-picked
            // launch stays at the top rather than sinking as it ages.
            freshness: row.featured ? 200 - row.featured_rank : Math.max(1, Math.round(100 - Math.min(99, ageHours / 2))),
            accent: ACCENTS[index % ACCENTS.length],
            tags: Array.isArray(row.tags) && row.tags.length ? row.tags : [row.category],
            url: row.url,
            source: row.source,
            sourceUrl: row.source_url ?? undefined,
        };
    });

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    json(res, 200, { launches });
}
