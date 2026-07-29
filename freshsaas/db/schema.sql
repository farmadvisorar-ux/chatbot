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
-- Set once an entry has appeared in an outreach digest to the site owner, so
-- each batch shows launches not seen before rather than repeating the newest.
ALTER TABLE directory_entries ADD COLUMN IF NOT EXISTS digested_at TIMESTAMPTZ;
-- Featured entries are pinned to the top of the directory and rendered with
-- the highlight treatment. featured_rank orders them against each other;
-- lower sorts first, ties fall back to recency.
-- Contact address published on the product's own site, for manual outreach.
-- contact_checked_at is set even when nothing is found, so each site is only
-- fetched once rather than re-crawled on every run.
ALTER TABLE directory_entries ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE directory_entries ADD COLUMN IF NOT EXISTS contact_kind TEXT;
ALTER TABLE directory_entries ADD COLUMN IF NOT EXISTS contact_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS directory_entries_contact_todo ON directory_entries (contact_checked_at) WHERE contact_checked_at IS NULL;

ALTER TABLE directory_entries ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE directory_entries ADD COLUMN IF NOT EXISTS featured_rank INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS directory_entries_featured ON directory_entries (featured, featured_rank) WHERE featured;
CREATE INDEX IF NOT EXISTS directory_entries_undigested ON directory_entries (digested_at, discovered_at) WHERE digested_at IS NULL;

-- First-party visitor analytics. Deliberately cookie-free and free of personal
-- data: no IP address is stored, and session_id is a random per-tab value that
-- disappears when the tab closes. That keeps this outside cookie-consent
-- requirements while still answering what people actually do on the site.
CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    referrer_host TEXT,
    country TEXT,
    device TEXT,
    session_id TEXT,
    entry_id UUID,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_time ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_type ON analytics_events (type, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_label ON analytics_events (type, label);

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);

-- Insights: buyer's-guide articles ("best X", "A vs B") that bring search
-- traffic in and hand it to listings. Article copy is authored in the repo
-- and seeded from scripts/insights-content.mjs; the affiliate links are the
-- one field edited from the admin panel, so the seeder never overwrites them.
CREATE TABLE IF NOT EXISTS insight_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    keyword TEXT NOT NULL,
    meta_description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Guides',
    excerpt TEXT NOT NULL,
    body_html TEXT NOT NULL,
    -- [{ name, url, note, affiliateUrl }] — affiliateUrl is admin-owned and
    -- is what turns a plain outbound link into a monetised one.
    links JSONB NOT NULL DEFAULT '[]'::jsonb,
    read_minutes INT NOT NULL DEFAULT 4,
    rank INT NOT NULL DEFAULT 100,
    published BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insight_articles_live ON insight_articles (published, rank, created_at DESC);

-- Ownership disclosure shown at the top of an article. Guides that rank a
-- FreshSAAS-owned property have to say so: an undisclosed self-ranking in a
-- "best of" list is a deceptive endorsement under the FTC guides, and the
-- disclosure is what keeps the promotional guides defensible.
ALTER TABLE insight_articles ADD COLUMN IF NOT EXISTS disclosure TEXT;

-- Upvotes. Every competing launch directory runs on this loop and FreshSAAS
-- had no engagement mechanic at all. The count is denormalised onto the entry
-- so the directory read stays a single table scan; directory_votes exists to
-- stop one visitor voting twice.
ALTER TABLE directory_entries ADD COLUMN IF NOT EXISTS votes INT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS directory_votes (
    entry_id UUID NOT NULL REFERENCES directory_entries(id) ON DELETE CASCADE,
    -- Random key held in the visitor's localStorage. Anonymous by design: no
    -- account needed to vote, and clearing storage lets someone vote again,
    -- which is the same trade every directory in this category makes.
    voter_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entry_id, voter_key)
);
CREATE INDEX IF NOT EXISTS directory_votes_entry ON directory_votes (entry_id);
CREATE INDEX IF NOT EXISTS directory_entries_votes ON directory_entries (votes DESC) WHERE status = 'live';
