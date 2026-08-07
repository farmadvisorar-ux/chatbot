/**
 * The schema, inlined so it can be applied from a serverless function where
 * there is no reliable filesystem to read db/schema.sql from.
 *
 * db/schema.sql remains the file humans and psql use. tests/schema.test.mjs
 * asserts the two are byte-identical, so this copy cannot drift out of step
 * with the one the migration scripts apply.
 */
export const SCHEMA_SQL = `-- Tooiicy schema. Run once against DATABASE_URL via \`npm run migrate\`, or
-- pipe this file straight into psql.

-- Required for gen_random_uuid() below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The catalog. Deliberately not a live mirror of the Printful catalog: an
-- admin adds a product here once (name, price, and the printful_variant_id
-- each size/color maps to) and it stays exactly as priced until someone
-- changes it, rather than re-pricing itself whenever Printful's own catalog
-- moves. Merch, not a Printful pass-through.
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_active ON products (active, sort_order);

-- One row per purchasable size/color. printful_variant_id is what actually
-- gets fulfilled — it is the id Printful's Orders API expects, looked up from
-- Printful's catalog when the admin adds the product. Two variants of the
-- same product can't point at the same Printful variant, since that would
-- make it ambiguous which one a paid order was for.
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    printful_variant_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    image_url TEXT,
    in_stock BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, printful_variant_id)
);
CREATE INDEX IF NOT EXISTS product_variants_product ON product_variants (product_id, sort_order);

-- Lifecycle: awaiting_payment (created when the Stripe Checkout Session is
-- opened, before anyone has paid) -> paid (webhook confirmed) ->
-- submitted_to_printful (fulfillment order accepted) or fulfillment_error
-- (Printful rejected it — held for an admin to retry) -> shipped (Printful
-- webhook reported it left the warehouse). cancelled covers a Checkout
-- Session that was opened and abandoned or expired.
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting_payment'
        CHECK (status IN ('awaiting_payment', 'paid', 'submitted_to_printful', 'fulfillment_error', 'shipped', 'cancelled')),
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents > 0),
    shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents > 0),
    shipping_name TEXT,
    -- Free-form because Stripe's own shipping_details shape is what gets
    -- stored — {line1, line2, city, state, postal_code, country} — and it is
    -- read back only for display and for the Printful recipient, never
    -- queried by field.
    shipping_address JSONB,
    printful_order_id BIGINT,
    tracking_number TEXT,
    tracking_url TEXT,
    fulfillment_error TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_status ON orders (status, created_at DESC);

-- A snapshot of what was bought, not a live join back to product_variants:
-- name and unit_price_cents are copied at checkout time so that a later price
-- change or renamed product never rewrites the receipt for an order already
-- placed. printful_variant_id is copied for the same reason and is what
-- actually gets sent to Printful when the order is fulfilled.
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    printful_variant_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id BIGSERIAL PRIMARY KEY,
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_lookup ON rate_limit_events (bucket, client_key, created_at);
`;
