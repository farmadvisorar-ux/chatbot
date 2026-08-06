# RoofSignal — Solo Edition

**A one-roofer lead engine and inspection workflow for "John with Cypress,"
working a 30-mile radius around Bossier City / Shreveport, LA.**

Mobile-first web app (installable as a PWA on iOS/Android) rather than an
App Store / Play Store build — see [Platform](#platform-web-app-not-app-store-native)
below for why, and what it would take to go native.

## What's built

- **Daily lead drops** — 20-50 leads/day, each with a name, phone, address,
  neighborhood, roof-age estimate, storm-impact score, and insurance-claim
  likelihood, all inside the 30-mile territory. Storm scoring is drawn from
  **real NOAA storm history** for the lead's actual parish when it's on file
  — see [Real data](#real-data-noaa-storm-history) below.
- **Territory map** — Leaflet + OpenStreetMap (no API key needed), pins
  colored by pipeline status, tap to open a lead.
- **Homeowner profile** — every field from the spec, call/call-log history,
  message log, photos, appointments, and inspection summaries in one drawer.
- **Call + follow-up** — tapping Call opens the phone's own dialer
  (`tel:`); logging a `no_answer`/`voicemail` outcome auto-drafts a
  branded follow-up text referencing a real regional storm and Louisiana
  wind/hail deductible norms.
- **Auto-scheduling** — one tap books the next open 60-minute slot
  (Mon-Sat, 8am-5pm Central), skips conflicts, and drafts a confirmation
  text.
- **1-hour reminders** — a scheduled job finds appointments starting in
  ~60 minutes and logs a reminder text.
- **Inspection module** — camera/file photo capture, tagged
  storm/age/insurance/general, stored in Vercel Blob.
- **Auto-generated summary** — drafts roof condition, storm analysis,
  insurance notes, and a recommendation from the lead's data plus field
  notes, signed "John with Cypress."
- **SMS-shareable summary link** — `/s/<token>`, expires in 30 days, a
  fresh link on every regeneration.
- **Pipeline** — New → Interested → Needs Inspection → Booked → Not
  Interested, single-tap to change, plus a kanban board view.

## Real data: NOAA storm history

`storm_events` holds actual historical severe-weather records from
[NOAA/NCEI's Storm Events Database](https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/)
— free, public, no API key or login required. `scripts/fetch-storm-events.mjs`
downloads the bulk CSV for each of the last 10 years, keeps only hail,
wind, tornado, hurricane, and tropical-storm events (the types that matter
for a roof), filters to the territory's four real parishes (Bossier, Caddo,
DeSoto, Webster — verified per-town in `api/_lib/geo.ts`, not guessed from
proximity), and upserts them keyed on NOAA's own event ID.

When a lead is generated, `api/_lib/leadgen.ts` looks up its parish's real
storm history: `stormScore` is computed from actual event severity
(hail size in inches, wind speed in **knots** — not mph; NOAA's own format
confirms wind magnitude is recorded in knots, see `api/_lib/stormData.ts`)
weighted by recency, and the lead is linked to the single most relevant
real event (`leads.storm_event_id`). Follow-up texts and inspection
summaries then name that actual storm — including an excerpt of NOAA's own
narrative for it — instead of a generic line. A lead only falls back to the
roof-age-only heuristic when its parish has no real events on file yet
(e.g. before the fetch script's first run).

Run it once after deploying (`npm run fetch:storms`, needs `DATABASE_URL`),
then `.github/workflows/roofsignal-storm-data.yml` re-runs it monthly —
NOAA revises recent months' records for a while after they happen, so a
single run goes stale.

## What's intentionally *not* wired up, and why

**No real homeowner identity or phone data — this is a firm limit, not a
missing integration.** I looked: Caddo and Bossier Parish assessor records
and GIS portals do exist and are publicly searchable, and they do expose an
owner's *name* and *address* — but never a phone number, which is simply
never a public assessor field anywhere. Compiling real people's names into
an unsolicited-contact list, or attaching invented phone numbers to real
addresses, isn't something this app will do regardless of what's technically
scrapable — that's a TCPA/privacy problem, not an engineering one.
`api/_lib/leadgen.ts` generates clearly-synthetic leads instead, so the rest
of the app (calling, texting, scheduling, inspection, summaries, pipeline)
is fully functional today. Two things make the synthetic data safe to run:
phone numbers use the `555-01XX` block the NANP reserves for fiction (never
rings a real person), and names are drawn from generic pools, not real
homeowners. If John ever gets a licensed lead-data vendor or wants to key
leads off his own parish assessor lookups by hand, swap in a real source by
writing a `LeadSource` that fills the same `leads` columns — nothing
downstream changes.

**No automated SMS/voice sending — this is the Google Voice caveat.**
Google Voice has no supported API for sending SMS or placing calls
programmatically; only a Twilio-class provider offers that, and this
deployment has no such account. So instead of pretending to auto-text
homeowners, the app:
- Opens the phone's own dialer via `tel:` for calls — if Google Voice is
  set as the default calling app, calls route through it automatically.
- Builds an `sms:` link pre-filled with the drafted message and opens it —
  same story on Android if Voice is the default SMS app. **On iOS, Google
  Voice cannot be the default SMS handler** (an OS restriction), so the
  `sms:` link opens Messages instead; the message body is still pre-filled
  and every draft is logged in the lead's message history so nothing is
  lost, it just needs a manual send/paste into Voice.
- Logs every message it drafts with `status: 'logged'`.

To go fully automatic, add a `sendSms()` in `api/_lib/messaging.ts` that
calls Twilio (or Google Voice's own outbound API, if a Google Workspace
tenant is ever set up for one) and flip `messages.status` to `'sent'` —
the schema and every call site already expect that field to change.

## Platform: web app, not App Store native

The rest of this repo's projects (`sikads`, `freshsaas`) are Vite + Vercel
web apps, and RoofSignal follows the same shape. A true native iOS/Android
build needs Xcode/Android Studio, App Store/Play Store developer accounts,
and (for feature parity) a React Native/Expo rewrite — none of which this
environment can build, sign, or submit. What's here instead: a mobile-first
responsive UI with a bottom tab bar, `<input capture="environment">` camera
capture, and a `manifest.webmanifest` so John can "Add to Home Screen" on
either platform and get an app-like icon and standalone window.

## Local development

```bash
npm install
cp .env.example .env    # DATABASE_URL and APP_SECRET at minimum
npm run migrate         # applies db/schema.sql
npm run dev             # http://localhost:5173
npm test                # territory, lead-gen, scheduling, schema
```

`vite dev` serves the pages but not the `/api` functions, so the app will
report itself unreachable until deployed (or run under `vercel dev`).

## Deploying

1. **Database** — Neon, Vercel Postgres, or Supabase. Run `npm run migrate`
   against it once (or let the app create the schema on its first request —
   see `api/_lib/errors.ts`).
2. **Vercel** — import the repo with **Root Directory** set to `roofsignal`.
3. **Blob storage** — add a Vercel Blob store to the project; it sets
   `BLOB_READ_WRITE_TOKEN` automatically. Without it, photo upload returns a
   clear "not configured" error rather than failing silently.
4. **Env vars** — `DATABASE_URL`, `APP_SECRET` (any long random string —
   `openssl rand -hex 32`), `CRON_SECRET` (same idea), `PUBLIC_SITE_URL`
   (no trailing slash — used to build `/s/<token>` links).
5. **Scheduled jobs** — see `.github/workflows/roofsignal-cron.yml`. Vercel's
   Hobby plan caps cron at once/day, too coarse for an hourly reminder
   window, so both jobs run from GitHub Actions instead and call
   `/api/cron?task=daily-leads` / `?task=reminders` with `CRON_SECRET`. Set
   `CRON_SECRET` as a GitHub Actions repository secret too, and
   `ROOFSIGNAL_URL` as a repo variable if the deployment domain isn't
   `roofsignal.vercel.app`.
6. **Real storm data** — run `npm run fetch:storms` once (needs
   `DATABASE_URL`), and set `DATABASE_URL` as a GitHub Actions repository
   secret so `.github/workflows/roofsignal-storm-data.yml` can keep it fresh
   monthly. Leads generate fine without this step — they just fall back to
   the roof-age heuristic until a parish has real events on file.
7. **Sign in** — open the deployed app and enter the `APP_SECRET` value as
   the app key. There's exactly one user, so there's no signup flow.

## Territory

Center: Bossier City / Shreveport, LA (32.5205, -93.7412). Radius: 30
miles, spanning four real parishes: Caddo, Bossier, DeSoto, and Webster.
`api/_lib/geo.ts` holds the center, the haversine distance function, and a
seeded list of real neighborhoods/towns within range (Haughton, Benton,
Blanchard, Greenwood, Keithville, Stonewall, Minden, and more), each tagged
with the parish it's actually in — verified per-town, not guessed from map
proximity, since that mapping is what routes a lead to the correct county's
real storm history. Every neighborhood is checked against the 30-mile
radius in `tests/geo.test.mjs`.

## What is not built yet

- **Real homeowner identity/phone data.** See above — a firm limit, not
  a missing integration.
- **Automated SMS/voice sending.** See above — this needs Twilio or
  equivalent; Google Voice has no API for it.
- **Multi-day route optimization.** The calendar shows appointments in time
  order; it doesn't reorder a day's stops by drive distance.
- **Push notifications.** Reminders are logged as messages John sends
  himself; there's no native push to his phone when one is due.
