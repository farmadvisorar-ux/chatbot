-- AuditPulse schema. Run once against DATABASE_URL via `npm run migrate`.

-- Users are authenticated via Clerk (Google, Microsoft, email+password, email
-- magic link). This table mirrors the subset of Clerk's user record we need
-- plus billing state; kept in sync by the Clerk webhook (api/webhooks/clerk.ts)
-- on user.created / user.updated / user.deleted.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Clerk user id (e.g. "user_...")
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stripe subscription state. Two paid plans exist: 'audit' ($7/mo, unlimited
-- audits) and 'audit_fix' ($14/mo, unlimited audits + the GitHub auto-fix
-- feature). subscription_status mirrors Stripe's status field directly
-- ('active', 'trialing', 'past_due', 'canceled', 'unpaid', ...) so the
-- webhook handler never has to invent its own vocabulary; `plan` is derived
-- from which Stripe price the subscription's line item is for. A NULL/absent
-- row means the user has never subscribed (still gets the free trial).
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT CHECK (plan IN ('audit', 'audit_fix'));

-- A website the user wants audited. Scanning is gated on `verified` (proof of
-- ownership/control) so the platform can't be used to run active checks
-- against domains the caller doesn't control — see verification in
-- api/targets/[id]/verify.ts. `attested_*` records the legal authorization
-- checkbox the user ticks when adding the target, independent of the
-- technical proof, as a durable record of consent to test.
CREATE TABLE IF NOT EXISTS targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    hostname TEXT NOT NULL,
    label TEXT,
    verification_token TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    verification_method TEXT,
    attested_authorization BOOLEAN NOT NULL DEFAULT false,
    attested_at TIMESTAMPTZ,
    attested_ip TEXT,
    auto_rescan BOOLEAN NOT NULL DEFAULT true,
    client_emails TEXT[] NOT NULL DEFAULT '{}',
    last_scanned_at TIMESTAMPTZ,
    next_rescan_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS targets_user ON targets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS targets_due_for_rescan ON targets (next_rescan_at) WHERE auto_rescan AND verified;

-- Optional GitHub repo connection for the auto-fix feature (audit_fix plan
-- only). A fine-grained Personal Access Token scoped to just this repo
-- (Contents + Pull requests, read & write) is pasted in by the user and
-- stored encrypted at rest (api/_lib/crypto.ts) — never in plaintext.
ALTER TABLE targets ADD COLUMN IF NOT EXISTS github_repo TEXT; -- "owner/repo"
ALTER TABLE targets ADD COLUMN IF NOT EXISTS github_token_encrypted TEXT;
ALTER TABLE targets ADD COLUMN IF NOT EXISTS github_connected_at TIMESTAMPTZ;

-- One run of the scan engine against one target. `share_token` lets the
-- emailed report be opened by the client with no account (report.html?token=),
-- so a non-technical stakeholder never has to sign up just to view findings.
CREATE TABLE IF NOT EXISTS scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('quick', 'full')),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    score INTEGER,
    grade TEXT,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb, -- counts by severity
    error TEXT,
    share_token TEXT NOT NULL UNIQUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    triggered_by TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'auto_rescan'))
);
CREATE INDEX IF NOT EXISTS scans_target ON scans (target_id, started_at DESC);
CREATE INDEX IF NOT EXISTS scans_user ON scans (user_id, started_at DESC);

-- One vulnerability/misconfiguration finding from a scan.
CREATE TABLE IF NOT EXISTS findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    description TEXT NOT NULL,
    evidence TEXT,
    remediation TEXT NOT NULL,
    references TEXT[] NOT NULL DEFAULT '{}',
    affected_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS findings_scan ON findings (scan_id, severity);

-- Auto-fix (audit_fix plan): auto_fixable is set at scan time for check
-- types the fixer engine (lib/fixers/) knows how to patch (outdated JS
-- dependency, missing security header, missing security.txt) — whether a fix
-- can actually be opened still depends on the connected repo containing the
-- expected file/stack, checked at fix time, not scan time.
ALTER TABLE findings ADD COLUMN IF NOT EXISTS auto_fixable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS fix_status TEXT NOT NULL DEFAULT 'none' CHECK (fix_status IN ('none', 'pr_open', 'pr_merged', 'failed'));
ALTER TABLE findings ADD COLUMN IF NOT EXISTS fix_pr_url TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS fix_error TEXT;

-- Audit trail of report emails sent to clients (dashboard "Email report").
CREATE TABLE IF NOT EXISTS scan_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    recipient TEXT NOT NULL,
    note TEXT,
    sent_by TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'sent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_emails_scan ON scan_emails (scan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
