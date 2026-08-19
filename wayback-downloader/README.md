# Wayback Downloader (Web)

A user-friendly **web app** for downloading archived websites from the
[Internet Archive Wayback Machine](https://web.archive.org). It's a
from-scratch reimplementation of the idea behind
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
- **Everything runs in your browser** — the CDX lookup, every file download,
  and the zip build all happen client-side. No server, no backend, nothing
  to deploy but static files.
- **Cancel anytime** mid-download.

## Why this is a plain static app, not a backend service

Earlier versions of this app tried routing the Wayback Machine requests
through Vercel serverless functions. That ran into a real, reproducible
problem: `archive.org` responds fine and fast to ordinary requests, but
requests to `web.archive.org` from serverless/datacenter IP ranges (Vercel's
included) were silently dropped or reset — not fixed by adding a `User-Agent`
header or retrying. This is very likely a form of anti-bot/anti-scraping
protection that treats cloud infrastructure differently from an ordinary
visitor's browser.

The fix: **don't route through a server at all.** Every request to
`web.archive.org` — the CDX API lookup and every individual file download —
is made directly from the browser, using the visitor's own network. This
sidesteps the datacenter-IP problem entirely, and as a side effect makes the
whole app dramatically simpler:

1. **CDX lookup** (`src/lib/cdx.ts`) queries `web.archive.org/cdx/search/cdx`
   directly from `fetch()` in the browser.
2. **Downloads** (`src/lib/downloader.ts`) fetch each snapshot's raw content
   directly from `web.archive.org` with a small worker pool, streaming each
   result into memory as a `Blob`.
3. **The zip is built in-browser** with [`client-zip`](https://github.com/Touffy/client-zip)
   from the `Blob`s already collected in step 2 — no re-fetching, no server
   round-trip.

There is no `api/` folder, no database, no Blob storage, nothing to
configure beyond deploying the static build. The trade-off: **the browser
tab needs to stay open** for the duration of a download, since that's where
all the work happens. For a typical small-to-medium site (up to a few
hundred files) this finishes in well under a minute.

If `web.archive.org` ever also starts blocking ordinary browser traffic (as
opposed to just cloud IPs), that would be a genuine outage on their end —
not something a client-side or server-side fix here can work around.

## Project layout

```
wayback-downloader/
├── index.html                  # single-page UI (no framework)
├── src/
│   ├── main.ts                  # form handling, progress UI, drives the whole flow
│   ├── style.css
│   └── lib/
│       ├── cdx.ts                # Wayback CDX API client + filtering
│       ├── urlmap.ts             # archived URL -> file path (index.html per dir, etc.)
│       ├── downloader.ts         # pooled downloader, collects Blobs + progress events
│       └── params.ts             # form input validation
└── tests/                       # node:test suite for the pure logic (cdx/urlmap/params/downloader)
```

## Deploying

This is a static site — `npm run build` produces plain HTML/CSS/JS in
`dist/`. Deploy it anywhere that serves static files: Vercel, Netlify,
Cloudflare Pages, GitHub Pages, or your own web server. No environment
variables, no database, no backend to provision.

On Vercel specifically: import the repo with this directory
(`wayback-downloader/`) as the project root — it auto-detects the Vite
build. That's the entire setup.

### Local development

```bash
npm install
npm run dev       # Vite dev server at http://localhost:5173
```

Since there's no backend, `npm run dev` is fully functional on its own —
no need for `vercel dev` or any other proxy.

## Running the tests

```bash
npm install
npm test          # node:test over the pure logic — no network needed
npm run typecheck
npm run build
```

## Limitations & notes

- **The browser tab must stay open** for the duration of a download, since
  that's where the CDX lookup, every file fetch, and the zip build all
  happen.
- **Very large sites use a lot of browser memory**, since every downloaded
  file is held in memory (as a `Blob`) until the zip is built. The max-files
  slider (default cap 1000) exists to keep this reasonable.
- **`web.archive.org` may still rate-limit an unusually large/fast run** even
  from a browser — the downloader uses a modest concurrency (6 at a time) to
  stay a good citizen of a free, shared service.

## Credits

Inspired by [hartator/wayback-machine-downloader](https://github.com/hartator/wayback-machine-downloader).
This project is an independent reimplementation and is not affiliated with
the Internet Archive or the original gem's authors. Please be a good citizen
of the Wayback Machine's free, shared infrastructure — keep file caps
reasonable.
