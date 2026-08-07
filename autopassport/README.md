# AutoPassport

**The public, human-reviewed record of what actually runs on a car's screen.**

Android Auto blocks most of what's on a phone from ever reaching the dash —
navigation, music, phone and messaging apps are the exceptions, and even
those don't always render the way their store listing implies. AutoPassport
is a directory of the ones that were actually opened on a car's display and
confirmed to work.

- **Drivers** browse the passport for free, by category, to find out what's
  car-ready before they go looking for it behind the wheel.
- **Developers** submit an app and pay a flat **$49** one-time fee for a
  review. Paid doesn't mean listed — a human runs the app on an actual car
  display before it gets a stamp.

## How an app gets stamped

1. **Developer submits.** `POST /api/apps?action=submit` validates the
   listing, writes it as `awaiting_payment`, and opens a Stripe Checkout
   Session for the flat fee.
2. **Webhook confirms.** `api/webhooks/stripe.ts` flips the row to
   `pending_review` on `checkout.session.completed`. Paid is not listed.
3. **A human drives it.** `/admin.html` → the review queue. Approve → the app
   is `certified` and joins the public directory; reject → it stays off.
4. **The directory serves it.** `GET /api/apps` returns only `status =
   'certified'` rows, filterable by `category` and a free-text `q`.

`GET /api/apps?view=stats` is a separate read-only endpoint for the landing
page's live proof numbers (total certified apps, current fee).

## Categories

Kept to four, because that's what a driver actually reaches for from behind
the wheel: `navigation`, `music`, `phone_messaging`, `other`. The list lives
in `api/_lib/pricing.ts` and is mirrored in `src/main.ts`.

## Money

`CERTIFICATION_FEE_CENTS` in `api/_lib/pricing.ts` is the one number this
business runs on — a flat $49 per submission, quoted verbatim on the landing
page. There is no recurring charge and no seller payout to track; 100% of
the fee is platform revenue for the review itself, whether the app passes or
not.

## Local development

```bash
npm install
cp .env.example .env    # DATABASE_URL at minimum
npm run migrate         # applies db/schema.sql
npm run dev
```

`vite dev` serves the pages but not the `/api` functions, so the directory
and submission form will report themselves unreachable until deployed (or
run under `vercel dev`).

## Deploying to autopassport.app

1. **Database** — Neon, Vercel Postgres or Supabase. Run `npm run migrate`
   against it once.
2. **Vercel** — import the repo with **Root Directory** set to
   `autopassport`.
3. **Stripe** — one **secret key**, plus a webhook endpoint at
   `https://<your-domain>/api/webhooks/stripe` subscribed to
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   (the second covers delayed payment methods, where the form can be
   submitted before the money actually arrives).
4. **Env vars** — `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `ADMIN_SECRET` (any long random string), `PUBLIC_SITE_URL`.
5. **Domain** — add the domain in the Vercel project's Domains settings and
   point DNS at Vercel. Then set `PUBLIC_SITE_URL` to match and update the
   webhook URL accordingly.

## What is not built yet

- **No developer dashboard.** A submitter finds out their app was approved
  or rejected by checking the public directory or being emailed manually —
  there is no login for developers to check status themselves.
- **No re-review flow.** If a certified app later breaks on the dash (an
  update changes its Android Auto behavior), there is no automated way to
  catch that — a stamp is only ever revoked by an operator editing `status`
  directly in the database.
- **No native app.** AutoPassport is the directory and certification
  process, not an Android Auto app itself — "what shows up on the dash" is
  reviewed by a human driving with the submitted app, not measured
  automatically.
