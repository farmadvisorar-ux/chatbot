# Website Snapshot Recovery

A small Express service with one endpoint, `POST /api/recover`, that fetches a
historical Wayback Machine snapshot for a domain and returns sanitized HTML
safe to render or hand off to a rebuild pipeline.

```
POST /api/recover
Content-Type: application/json

{ "domain": "examplehairsalon.com", "timestamp": "20220115000000" }
```

`timestamp` is optional (a 14-digit `YYYYMMDDHHMMSS` Wayback timestamp;
defaults to `20210101000000` if omitted). Response:

```json
{
  "success": true,
  "message": "Website snapshot recovered and sanitized successfully.",
  "domain": "examplehairsalon.com",
  "timestamp": "20220115000000",
  "data": "<...sanitized html...>"
}
```

## ⚠️ Before deploying this: read the sibling project's finding

`wayback-downloader/` in this repo used to work exactly this way — a
server-side fetch to `web.archive.org` — and it was deliberately removed
(commit "Move wayback-downloader fully client-side; remove the api/
backend"). The documented reason, from that project's README:

> `archive.org` responds fine and fast to ordinary requests, but requests to
> `web.archive.org` from serverless/datacenter IP ranges were silently
> dropped or reset — not fixed by adding a `User-Agent` header or retrying.

Testing this service from this sandbox reproduces exactly that: the request
to `web.archive.org` fails with `ECONNRESET` while ordinary outbound requests
work fine. Any environment on cloud/datacenter egress (Vercel, most other
serverless hosts, most VPS providers) is likely to hit the same wall. Before
relying on this service in production, verify it actually works from wherever
you plan to host it — a residential/office network egress, or a host archive.org
doesn't rate-limit as aggressively. If it doesn't, the client-side approach
used in `wayback-downloader/` (fetch directly from the visitor's browser) is
the documented workaround for this exact problem.

## Security hardening applied

The version of this route that prompted this project had several issues,
fixed here:

- **Input validation** (`src/lib/validators.js`): `domain` must resolve to a
  syntactically valid public hostname — private/loopback/link-local hosts
  (`localhost`, `127.0.0.1`, `169.254.169.254`, RFC1918 ranges, etc.) are
  rejected. `timestamp` must be exactly 14 digits.
- **Real HTML sanitization** (`src/lib/sanitizeSnapshot.js`): after rewriting
  Wayback-prefixed URLs back to the original link and stripping the injected
  toolbar, the markup is run through `sanitize-html` with an explicit tag/
  attribute allowlist. This strips `<script>`, `<iframe>`, `<object>`,
  `<embed>`, `<form>`, `<style>`, all `on*` event handler attributes, and
  `javascript:`/`data:` URIs — the original ad-hoc cheerio rules only handled
  a few specific cases and left everything else (including arbitrary inline
  `<script>` tags) untouched.
- **Rate limiting**: 10 requests/minute per IP, since this endpoint drives
  outbound requests to a third-party service on the caller's behalf.
- **Response size cap**: 15 MB, so a single huge snapshot can't exhaust
  server memory.
- **No internal error detail leakage**: the error response no longer
  includes the raw exception message.

## Local development

```bash
npm install
npm start        # listens on PORT (default 3000)
npm test         # node:test — no network required
```
