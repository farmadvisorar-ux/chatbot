-- FreshSAAS schema. Run once against DATABASE_URL via `npm run migrate`.

CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product TEXT NOT NULL,
    url TEXT NOT NULL,
    promise TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS construction_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    customer TEXT NOT NULL,
    value NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('Bidding', 'Active', 'Closeout')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    rfis INTEGER NOT NULL DEFAULT 0,
    changes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Marketplace: sellers list a SaaS product; FreshSAAS takes a 10% platform
-- fee on completed sales. Orders are demo/stubbed until a real payment
-- processor (e.g. Stripe Connect) is wired up.
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    description TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    seller_email TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'live', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
    buyer_email TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    platform_fee_cents INTEGER NOT NULL,
    seller_payout_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'stub_pending_payment_integration',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
