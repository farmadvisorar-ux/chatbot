-- Sikads schema. Run once against DATABASE_URL via `npm run migrate`, or pipe
-- this file straight into psql.

-- Required by api/publishers.ts, which mints slot keys with gen_random_bytes().
-- Declared here rather than only in the migrate scripts so that applying this
-- file by hand produces a working database — without it the tables all exist
-- and publisher signup fails on the first request.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Self-serve ads: anyone buys views for a one-line pitch that links to their
-- own site. The advertiser sets their own price (cpm_cents = price per 1,000
-- views) rather than picking from fixed packages; views_purchased is derived
-- server-side from budget_cents / cpm_cents. 100% of the price is platform
-- revenue — there is no seller payout to track.
--
-- Lifecycle: awaiting_payment -> pending_review (paid, held for a manual look
-- before it can go live) -> live -> exhausted (ran out of views) or rejected.
CREATE TABLE IF NOT EXISTS ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_email TEXT NOT NULL,
    headline TEXT NOT NULL,
    url TEXT NOT NULL,
    -- Advertiser's own price per 1,000 views, in cents. Higher-cpm campaigns
    -- are weighted to rotate more often in the sponsored slot (see api/ads.ts).
    cpm_cents INTEGER NOT NULL CHECK (cpm_cents > 0),
    budget_cents INTEGER NOT NULL CHECK (budget_cents > 0),
    views_purchased INTEGER NOT NULL DEFAULT 0,
    views_remaining INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'awaiting_payment'
        CHECK (status IN ('awaiting_payment', 'pending_review', 'live', 'rejected', 'exhausted')),
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_campaigns_live ON ad_campaigns (status) WHERE status IN ('live', 'pending_review');

-- Publishers place the Sikads ad unit on their own site and earn a share of
-- what advertisers pay for every view served there. This is what makes Sikads
-- two-sided: ad_campaigns is the money coming in, publishers is the money
-- going back out.
--
-- Earnings accrue in microcents (1 cent = 1,000 microcents) because a single
-- view is worth a fraction of a cent — at a $5.00 CPM a view earns the
-- publisher 0.2 cents, which integer cents cannot represent without losing
-- every impression to rounding.
CREATE TABLE IF NOT EXISTS publishers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    site_url TEXT NOT NULL,
    -- Pasted into the embed snippet to identify who served a view. Public by
    -- design: it ships inside client-side markup, so it authorises nothing on
    -- its own and is safe to expose.
    slot_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'active', 'rejected')),
    views_served BIGINT NOT NULL DEFAULT 0,
    earnings_microcents BIGINT NOT NULL DEFAULT 0,
    paid_microcents BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publishers_active ON publishers (slot_key) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
