# Tooiicy

**Official merch store for Juicecuzz.** Print-on-demand via Printful — nothing
is held in inventory; every paid order is submitted straight to Printful for
printing and shipping.

## How an order moves

1. **Shopper checks out.** The cart lives in the browser (`src/cart.ts`,
   localStorage — there is no account system). `POST /api/checkout` looks up
   every variant's real price server-side (a tampered client payload can
   change what's in the cart, never what it costs), writes the order as
   `awaiting_payment`, and opens a Stripe Checkout Session that also collects
   a US shipping address.
2. **Stripe confirms.** `api/webhooks/stripe.ts` flips the order to `paid` on
   `checkout.session.completed` and immediately attempts to submit it to
   Printful.
3. **Printful fulfills.** On success the order becomes
   `submitted_to_printful`; the Printful API call failing (bad address,
   Printful outage) instead leaves it as `fulfillment_error`, visible in
   `/admin.html` with the reason and a retry button.
4. **It ships.** If a Printful webhook is configured
   (`PRINTFUL_WEBHOOK_SECRET` + Dashboard → Settings → Webhooks →
   `package_shipped` → `/api/webhooks/printful`), the order flips to
   `shipped` with tracking info attached automatically.

## Admin

`/admin.html`, gated by `ADMIN_SECRET` (bearer token, no per-user roles):

- **Products** — add a product with one or more variants. Each variant needs
  the *Printful catalog variant id* it fulfills as — look this up in
  Printful's product catalog (or an existing store product) before adding it
  here; nothing here talks to Printful's catalog automatically. Price,
  stock, and visibility are all editable after creation.
- **Orders** — see what was ordered, the shipping address, and current
  status. Retry fulfillment on anything stuck in `fulfillment_error` once the
  underlying problem (usually a missing address field, or Printful being
  briefly down) is fixed. Status can also be changed by hand for edge cases
  the automatic flow doesn't cover.

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, STRIPE_SECRET_KEY, PRINTFUL_API_KEY, ADMIN_SECRET at minimum
npm run migrate         # creates the schema; npm run migrate:http works instead if your network blocks port 5432
npm run dev
```

Stripe webhooks need a public URL to reach — during local development, run
`stripe listen --forward-to localhost:5173/api/webhooks/stripe` (or test
against a Vercel preview deployment, which already has one).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build (`dist/`) |
| `npm run typecheck` | Type-checks both `src/` and `api/` |
| `npm test` | Runs `tests/*.test.mjs` |
| `npm run migrate` | Applies `db/schema.sql` over a direct Postgres connection |
| `npm run migrate:http` | Same, over Neon's HTTP endpoint (works where port 5432 is blocked) |

`/api/admin` also applies the schema itself (`{"action": "migrate"}`) from
inside a live deployment, for environments where nothing local can reach the
database directly.

## Environment variables

See `.env.example` for the full list with explanations. At minimum, a working
deployment needs `DATABASE_URL`, `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET`, `PRINTFUL_API_KEY`, and `ADMIN_SECRET`. Everything
that isn't configured yet fails with a clear "not set up" message instead of
crashing.

## Design placeholders

The brand system in `src/styles.css` (`:root` custom properties — colors,
`--font-display`/`--font-body`) and the copy on `index.html` are placeholders
standing in for real Tooiicy branding, logo, and product photography. Swap
the tokens and copy; the components themselves don't need to change.

## Not yet built

- Only US shipping is collected (`shipping_address_collection` in
  `api/checkout.ts`) and shipping is a flat rate (`SHIPPING_FLAT_CENTS`)
  rather than Printful's real per-order shipping cost — both are the
  simplest thing that works for a first launch, not a ceiling.
- No live sync from Printful's catalog — products are entered by hand in
  `/admin.html`. Fine at a few dozen SKUs; would need real syncing at
  catalog scale.
