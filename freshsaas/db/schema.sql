-- FreshSAAS schema. Run once against DATABASE_URL via `npm run migrate`.

-- Users are authenticated via Clerk (Google, Microsoft, email+password, email
-- magic link). This table mirrors the subset of Clerk's user record we need
-- for app data and the welcome email; it's kept in sync by the Clerk webhook
-- (api/webhooks/clerk.ts) on user.created / user.updated.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Clerk user id (e.g. "user_...")
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Stripe Connect account id for sellers receiving payouts. Only the opaque
-- "acct_..." id is stored: bank details live with Stripe, never here, which
-- keeps this database out of PCI scope.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payouts_enabled BOOLEAN NOT NULL DEFAULT false;

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
-- Approving a submission publishes it to directory_entries; this records which
-- entry it became so the same submission can't be published twice.
ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS published_entry_id UUID;
ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

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
-- seller identity now comes from the verified Clerk session (api/marketplace-listings.ts
-- requires auth), not a client-supplied email. seller_user_id/seller_email are added via
-- ALTER below too, so this applies cleanly to a database that already has this table.
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    description TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    seller_user_id TEXT NOT NULL REFERENCES users(id),
    seller_email TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'live', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS seller_user_id TEXT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS marketplace_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
    buyer_user_id TEXT NOT NULL REFERENCES users(id),
    buyer_email TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    platform_fee_cents INTEGER NOT NULL,
    seller_payout_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'stub_pending_payment_integration',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS buyer_user_id TEXT REFERENCES users(id);

-- Payment lifecycle. Money is taken with a Stripe Checkout Session that lands
-- in the platform balance and is NOT auto-forwarded; the seller is paid by an
-- explicit transfer once the asset handover is confirmed, so a seller cannot
-- take payment and disappear. Only Stripe object ids are stored here.
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT UNIQUE;
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
-- awaiting_payment -> paid_held -> released (or refunded)
ALTER TABLE marketplace_orders ADD COLUMN IF NOT EXISTS payment_state TEXT NOT NULL DEFAULT 'awaiting_payment';

-- Launches shown in the public directory. Rows arrive either from the hourly
-- ingest job (api/cron/ingest.ts, pulling official launch-source APIs) or from
-- an approved founder submission. dedup_key is a normalized name+host so the
-- same product discovered on two sources, or re-seen on later runs, inserts
-- once rather than duplicating.
CREATE TABLE IF NOT EXISTS directory_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedup_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'New launch',
    tags TEXT[] NOT NULL DEFAULT '{}',
    source TEXT NOT NULL,
    source_url TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'pending_review', 'rejected')),
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS directory_entries_live ON directory_entries (status, discovered_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
