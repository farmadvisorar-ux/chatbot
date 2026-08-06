# RoofSignal — Solo Edition

**A one-roofer lead engine and inspection workflow for "John with Cypress,"
working a 30-mile radius around Bossier City / Shreveport, LA.**

Mobile-first web app (installable as a PWA on iOS/Android) rather than an
App Store / Play Store build — see [Platform](#platform-web-app-not-app-store-native)
below for why, and what it would take to go native.

## What's built

- **Daily lead drops** — 20-50 leads/day, each with a name, phone, address,
  neighborhood, roof-age estimate, storm-impact score, and insurance-claim
  likelihood, all inside the 30-mile territory.
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

## What's intentionally *not* wired up, and why

**No live storm/insurance-data vendor.** "Verified" leads with real storm
and claim-likelihood scoring need a paid data contract (NOAA Storm Events
for hail/wind history, a roofing lead broker, or a carrier claims feed) —
nobody has handed this deployment credentials for one. `api/_lib/leadgen.ts`
generates clearly-synthetic leads instead, so the rest of the app (calling,
texting, scheduling, inspection, summaries, pipeline) is fully functional
today. Two things make the synthetic data safe to run: phone numbers use the
`555-01XX` block the NANP reserves for fiction (never rings a real person),
and names are drawn from generic pools, not real homeowners. Swap in a real
source by writing a `LeadSource` that fills the same `leads` columns —
nothing downstream changes.

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
6. **Sign in** — open the deployed app and enter the `APP_SECRET` value as
   the app key. There's exactly one user, so there's no signup flow.

## Territory

Center: Bossier City / Shreveport, LA (32.5205, -93.7412). Radius: 30
miles. `api/_lib/geo.ts` holds the center, the haversine distance function,
and a seeded list of real neighborhoods/towns within range (Haughton,
Benton, Blanchard, Greenwood, Keithville, Stonewall, Minden, and more) —
every one of them checked against the radius in `tests/geo.test.mjs`.

## What is not built yet

- **Real lead sourcing.** See above — this needs a paid data vendor.
- **Automated SMS/voice sending.** See above — this needs Twilio or
  equivalent; Google Voice has no API for it.
- **Multi-day route optimization.** The calendar shows appointments in time
  order; it doesn't reorder a day's stops by drive distance.
- **Push notifications.** Reminders are logged as messages John sends
  himself; there's no native push to his phone when one is due.
