-- AutoPassport schema. Run once against DATABASE_URL via `npm run migrate`.

-- One row per app a developer submits for certification. The fee only buys a
-- review, not a listing — status only reaches 'certified' after a human
-- approves it in /admin.html.
--
-- Lifecycle: awaiting_payment -> pending_review (paid, held for a manual
-- check that the app actually shows up on a car screen) -> certified (public,
-- stamped) or rejected.
CREATE TABLE IF NOT EXISTS apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_email TEXT NOT NULL,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('navigation', 'music', 'phone_messaging', 'other')),
    description TEXT NOT NULL,
    icon_url TEXT NOT NULL,
    store_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_payment'
        CHECK (status IN ('awaiting_payment', 'pending_review', 'certified', 'rejected')),
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    paid_at TIMESTAMPTZ,
    certified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apps_certified ON apps (category, certified_at DESC) WHERE status = 'certified';
CREATE INDEX IF NOT EXISTS apps_review ON apps (status) WHERE status = 'pending_review';

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
