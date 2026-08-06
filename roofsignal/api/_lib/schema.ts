/**
 * The schema, inlined so it can be applied from a serverless function where
 * there is no reliable filesystem to read db/schema.sql from.
 *
 * db/schema.sql remains the file humans and psql use. tests/schema.test.mjs
 * asserts the two are byte-identical, so this copy cannot drift out of step
 * with the one the migration scripts apply.
 */
export const SCHEMA_SQL = `-- RoofSignal schema. Run once against DATABASE_URL via \`npm run migrate\`, or
-- pipe this file straight into psql.

-- Required for gen_random_uuid() below. Declared here rather than only in the
-- migrate scripts so that applying this file by hand produces a working
-- database on its own.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One homeowner lead, generated daily or entered by hand. Territory is
-- enforced at write time (see api/_lib/geo.ts), not by a CHECK here, since
-- "within 30 miles of Bossier City/Shreveport" is a runtime computation over
-- lat/lng rather than a fixed set of values.
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    neighborhood TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    distance_miles NUMERIC(4,1) NOT NULL,
    roof_age_years INTEGER NOT NULL,
    storm_score INTEGER NOT NULL CHECK (storm_score BETWEEN 0 AND 100),
    insurance_likelihood INTEGER NOT NULL CHECK (insurance_likelihood BETWEEN 0 AND 100),
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'interested', 'needs_inspection', 'booked', 'not_interested')),
    notes TEXT NOT NULL DEFAULT '',
    -- The calendar day this lead was dropped, so "today's leads" and the
    -- once-a-day generator are simple date comparisons rather than a
    -- timestamp range query repeated everywhere.
    lead_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source TEXT NOT NULL DEFAULT 'daily_drop',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS leads_date ON leads (lead_date DESC);

CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'no_answer', 'voicemail', 'callback_requested')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_logs_lead ON call_logs (lead_id, created_at DESC);

-- Every SMS the app ever composed for a homeowner: auto follow-ups after a
-- call, appointment confirmations, 1-hour reminders, and the summary-link
-- text. \`status\` stays 'logged' unless a real send provider is wired in —
-- see api/_lib/messaging.ts for why sending itself isn't automated yet.
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('follow_up', 'confirmation', 'reminder', 'summary_link', 'manual')),
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'logged' CHECK (status IN ('logged', 'sent', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_lead ON messages (lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_lead ON appointments (lead_id);
CREATE INDEX IF NOT EXISTS appointments_starts ON appointments (starts_at);
-- The reminder cron scans exactly this slice every run; the partial index
-- keeps that scan cheap no matter how many completed/cancelled rows pile up.
CREATE INDEX IF NOT EXISTS appointments_reminder_due ON appointments (starts_at)
    WHERE status = 'scheduled' AND reminder_sent_at IS NULL;

CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT 'general' CHECK (tag IN ('storm', 'age', 'insurance', 'general')),
    taken_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_lead ON photos (lead_id, taken_at);

-- One inspection summary per generation. Kept append-only (never updated in
-- place) so re-generating after adding more photos produces a fresh share
-- link rather than silently changing what a previously sent link shows.
CREATE TABLE IF NOT EXISTS inspection_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    roof_condition TEXT NOT NULL,
    storm_analysis TEXT NOT NULL,
    insurance_notes TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    share_token TEXT NOT NULL UNIQUE,
    share_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS summaries_lead ON inspection_summaries (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS summaries_token ON inspection_summaries (share_token);

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
`;
