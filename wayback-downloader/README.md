# Wayback Downloader (Web)

A user-friendly **web app**, built to deploy on [Vercel](https://vercel.com), for
downloading archived websites from the [Internet Archive Wayback
Machine](https://web.archive.org). It's a from-scratch reimplementation of the
idea behind
[hartator/wayback-machine-downloader](https://github.com/hartator/wayback-machine-downloader)
(a Ruby CLI gem) — type a domain, watch it download, get a zip. No Ruby, no
CLI flags, no server to keep running.

## Features

- **Point-and-click**: enter a domain or URL, click *Download site*.
- **Preview before committing**: see how many snapshots match your filters
  and a sample of the URLs before starting a download.
- **Live progress**: a progress bar, per-file activity log, and running
  counts of downloaded / skipped / failed files.
- **Advanced filters**, mirroring the original CLI tool: date range, exact
  URL vs. whole domain, latest-per-page vs. every archived version, only
  HTTP 200 captures, a file-type checklist, include/exclude regex, and a
  max-files safety cap.
- **Zip built in your browser** — the server never assembles the archive,
  so there's no server-side memory/time limit on that step.
- **Cancel anytime** mid-download.

## Why this looks different from a typical Flask/Express app

Vercel runs your `api/` folder as **stateless serverless functions** — each
request gets its own short-lived invocation with no shared memory and no
persistent local disk. A traditional downloader (background threads, an
in-memory job queue, a live SSE connection, files written to local disk)
doesn't fit that model at all. This app is built around Vercel's constraints
instead of fighting them:

1. **Job state lives in [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)**,
   as a small JSON document (`jobs/<id>/state.json`), not in server memory.
2. **Progress is driven by polling, not a persistent connection.** The
   browser calls `POST /api/jobs/<id>/tick` in a loop; each call downloads a
   small batch (8 files, 4 at a time) from `web.archive.org`, uploads them to
   Blob storage, updates the job's state, and returns. The loop keeps going
   until the job is `done`, `error`, or `cancelled`. This keeps every
   function invocation well under Vercel's execution time limit regardless
   of plan.
3. **The final zip is built client-side.** Once a job is done, the browser
   has a manifest of `{name, blobUrl}` for every downloaded file. It fetches
   them directly from Blob storage and streams them into a zip using
   [`client-zip`](https://github.com/Touffy/client-zip) — entirely in the
   browser tab, so there's no server-side step that has to hold the whole
   site in memory or race a function timeout.
4. **A daily cron** (`api/cron/cleanup.ts`) deletes Blob storage for jobs
   older than `WMD_JOB_TTL_HOURS`.

The trade-off: **the browser tab needs to stay open** while a download runs,
since it's the thing driving the tick loop. For a typical small-to-medium
site (up to a few hundred files) this finishes in well under a minute.

## Project layout

```
wayback-downloader/
├── index.html                  # single-page UI (no framework)
├── src/{main.ts,style.css}     # client logic: form, polling loop, client-side zip
├── api/
│   ├── preview.ts               # POST: count + sample of matching snapshots
│   ├── jobs/
│   │   ├── index.ts             # POST: create a job (queries the CDX API)
│   │   ├── [id].ts              # GET: status · POST: request cancellation
│   │   └── [id]/tick.ts         # POST: download+upload one batch, advance the job
│   ├── cron/cleanup.ts          # deletes Blob storage for old/abandoned jobs
│   └── _lib/
│       ├── cdx.ts                # Wayback CDX API client + filtering
│       ├── urlmap.ts             # archived URL -> file path (index.html per dir, etc.)
│       ├── jobStore.ts           # job state persisted as JSON in Vercel Blob
│       ├── params.ts             # request validation shared by preview/jobs
│       └── http.ts               # small Vercel Node response helpers
└── tests/                       # node:test suite for the pure logic (cdx/urlmap/params)
```

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the
   repo) and import it into Vercel as a **new project**, with this directory
   (`wayback-downloader/`) as the project root.
2. In the Vercel dashboard: **Storage → Create Database → Blob**, and
   connect it to this project. That's it — Vercel injects
   `BLOB_READ_WRITE_TOKEN` automatically at build/runtime; no extra config.
3. Deploy. Vercel auto-detects the Vite build (`npm run build`, output
   `dist`) and the `api/` functions from `vercel.json`.
4. The daily cleanup cron (`vercel.json` → `crons`) is picked up
   automatically. If you want to call `/api/cron/cleanup` yourself outside
   of Vercel Cron, set a `CRON_SECRET` env var and send it as
   `Authorization: Bearer <secret>`.

### Local development

```bash
npm install
vercel dev   # requires the Vercel CLI: npm i -g vercel
```

`vercel dev` links to your Vercel project and pulls `BLOB_READ_WRITE_TOKEN`
automatically. Plain `npm run dev` (Vite only) serves the static frontend
but can't exercise `/api/*`, since those are Vercel functions.

### Environment variables

| Variable                  | Default | Meaning                                                |
|----------------------------|---------|----------------------------------------------------------|
| `BLOB_READ_WRITE_TOKEN`    | —       | Auto-set by Vercel once a Blob store is connected         |
| `WMD_MAX_FILES`            | `1000`  | Hard cap on files downloaded per job                       |
| `WMD_JOB_TTL_HOURS`        | `24`    | How long job state/files are kept before the cleanup cron runs |
| `CRON_SECRET`              | —       | Optional bearer secret for manually calling the cleanup cron |

See `.env.example`.

## Running the tests

```bash
npm install
npm test        # node:test over the pure logic (cdx, urlmap, params) — no network, no Vercel needed
npm run typecheck
```

The API route handlers themselves (which call the CDX API, Vercel Blob, and
`fetch` against `web.archive.org`) are exercised by deploying and running
the app for real — the request-parsing, CDX-parsing, and URL-mapping logic
they depend on is unit tested directly.

## Limitations & notes

- **Downloaded files are public.** Vercel Blob's public access mode means
  anyone with a file's URL can fetch it — but the job ID (and therefore
  every file path under it) is an unguessable random token, and the daily
  cron deletes jobs after `WMD_JOB_TTL_HOURS`. Don't use this for content
  that needs real access control.
- **`WMD_MAX_FILES` defaults to 1000** as a sane ceiling for a serverless,
  pay-per-use environment — raise it if you need to, but a very large site
  means a lot of tick round-trips (and a lot of Blob storage/bandwidth).
- **The browser tab must stay open** for the duration of a download, since
  it's what drives the polling loop that advances the job.

## Credits

Inspired by [hartator/wayback-machine-downloader](https://github.com/hartator/wayback-machine-downloader).
This project is an independent reimplementation and is not affiliated with
the Internet Archive or the original gem's authors. Please be a good citizen
of the Wayback Machine's free, shared infrastructure — keep file caps
reasonable.
