# Wayback Downloader (Web)

A modern, user-friendly **web app** for downloading archived websites from the
[Internet Archive Wayback Machine](https://web.archive.org). It's a from-scratch
reimplementation of the idea behind
[hartator/wayback-machine-downloader](https://github.com/hartator/wayback-machine-downloader)
(a Ruby command-line gem) as a self-hosted Flask app with a friendly UI —
no Ruby, no CLI flags, no local install of the target site's tooling. Just
type a domain, watch it download, and grab a zip.

![screenshot placeholder](#)

## Features

- **Point-and-click**: enter a domain or URL, click *Download site*.
- **Preview before committing**: see how many snapshots match your filters
  and a sample of the URLs before starting a download.
- **Live progress**: a real-time progress bar, per-file activity log, and
  running counts of downloaded / skipped / failed files, streamed over
  Server-Sent Events.
- **Advanced filters**, mirroring the original CLI tool:
  - Date range (`from` / `to`, `YYYYMMDD`)
  - Exact URL only vs. whole domain + subpaths
  - Latest snapshot per page (default) vs. every archived version
  - Only successful (HTTP 200) captures
  - File-type checklist (HTML, CSS, JS, images, PDF, ...)
  - Include/exclude regex on the URL
  - Adjustable concurrency and a max-files safety cap
- **Zip download** of the reconstructed site, laid out the way a browser
  would expect (`index.html` per directory, sanitized filenames).
- **Cancel anytime** mid-download.

## How it works

1. The browser posts your options to `POST /api/jobs`.
2. The server queries the public
   [Wayback CDX Server API](https://archive.org/help/wayback_api.php) to list
   every archived snapshot that matches your domain/filters.
3. Snapshots are downloaded concurrently (via the `id_` raw-content modifier,
   `https://web.archive.org/web/<timestamp>id_/<url>`, so pages aren't
   rewritten with the Wayback Machine's toolbar/link-rewriting) into a
   temporary directory that mirrors the site's original path structure.
4. The directory is zipped and offered back to the browser at
   `GET /api/jobs/<id>/download`.
5. Progress is streamed to the browser the whole time via
   `GET /api/jobs/<id>/stream` (SSE).

All of this runs in a single Flask process with in-memory job state — perfect
for personal or small-team use. See [Scaling notes](#scaling-notes) below if
you want to run this for many concurrent users.

## Running locally

Requires Python 3.10+.

```bash
cd wayback-downloader
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

### Running the tests

```bash
pip install -r requirements-dev.txt
pytest
```

Tests cover the URL→file-path mapping, CDX request/response handling, the
threaded downloader, the job pipeline, and the Flask API — all with the
Wayback Machine's network calls mocked out, so they run offline.

## Deploying

This is a plain Flask app, so it deploys anywhere that runs Python (Render,
Railway, Fly.io, a VPS, etc.). For production, run it behind `gunicorn`:

```bash
gunicorn -w 1 --threads 8 -b 0.0.0.0:$PORT app:app
```

> **Keep `-w 1` (a single worker)** unless you externalize job state (see
> below) — jobs live in that worker's memory, so a second worker wouldn't be
> able to see jobs started on the first.

Useful environment variables:

| Variable                  | Default | Meaning                                            |
|----------------------------|---------|-----------------------------------------------------|
| `PORT`                     | `8000`  | Port to listen on                                    |
| `WMD_MAX_FILES`            | `4000`  | Hard cap on files downloaded per job                 |
| `WMD_MAX_CONCURRENT_JOBS`  | `5`     | Max download jobs running at once across all users   |
| `WMD_JOB_TTL_SECONDS`      | `3600`  | How long finished jobs/zips are kept before cleanup   |

## Scaling notes

The job store is an in-memory `dict` and downloads run in background
threads — simple and dependency-free, at the cost of only working with a
single process. To scale beyond that, the natural next step is to swap the
`JobManager` in `wayback_downloader/jobs.py` for one backed by Redis/RQ or
Celery, and stream progress through Redis pub/sub instead of an in-process
`queue.Queue`. The rest of the app (CDX client, URL mapper, downloader,
Flask routes) doesn't need to change.

## Project layout

```
wayback-downloader/
├── app.py                     # Flask routes (pages + JSON/SSE API)
├── wayback_downloader/
│   ├── cdx.py                 # Wayback CDX API client + filtering
│   ├── urlmap.py               # archived URL -> local file path
│   ├── downloader.py           # threaded snapshot downloader
│   └── jobs.py                 # job orchestration (list -> download -> zip)
├── templates/index.html        # UI markup
├── static/{style.css,app.js}   # UI styling + client-side logic (no build step)
└── tests/                      # pytest suite (network calls mocked)
```

## Credits

Inspired by [hartator/wayback-machine-downloader](https://github.com/hartator/wayback-machine-downloader).
This project is an independent reimplementation and is not affiliated with
the Internet Archive or the original gem's authors. Please be a good citizen
of the Wayback Machine's free, shared infrastructure — keep concurrency and
file caps reasonable.
