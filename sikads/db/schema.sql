-- Sikads schema. Run once against DATABASE_URL via `npm run migrate`.

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

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
