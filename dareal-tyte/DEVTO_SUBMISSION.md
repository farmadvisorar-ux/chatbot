*This is a submission for [DEV's Summer Bug Smash: Clear the Lineup](https://dev.to/bugsmash) powered by [Sentry](https://sentry.io/).*

## Project Overview

**[DAREALTYTE](https://darealtyte.com)** is a Wayback Machine recovery and one-click deployment engine.

You point it at an expired or dormant domain. It pulls that domain's historical snapshot out of the Internet Archive, sanitizes the HTML (strips the Wayback toolbar the archive injects into every capture, rewrites archived asset URLs back to their original hosts, neutralizes leftover spam links), and deploys the cleaned result live to Vercel in one step.

The use case: you buy an expired domain with existing SEO history and want the original site back online without manually scraping and rebuilding it.

Stack: Vite + vanilla TypeScript frontend, Vercel serverless functions, Clerk for auth, Stripe for a one-time access fee.

## Bug Fix or Performance Improvement

The headline feature — *"browse every archived snapshot of this domain and pick one"* — **only ever returned a single snapshot.** Sometimes zero.

That's the whole product. If you can't see the archive's history, you can't choose what to restore.

What made this interesting is that fixing it uncovered a chain of four more bugs, each one hidden behind the last. Every fix moved the failure somewhere new:

| # | Symptom | Root cause |
|---|---|---|
| 1 | Only 1 snapshot ever returned | `matchType=exact` against a bare domain |
| 2 | Request timed out on large sites | Domain-wide match forced a full-history scan |
| 3 | `Load failed` in Safari | Browser-side cross-origin fetch to the CDX API |
| 4 | Only 1996–2006 showed up | Positive `limit` truncates from the *oldest* end |
| 5 | Only the last 5 months showed up | Negative `limit` truncates from the other end |

Plus two adjacent production bugs found along the way: every deployed site was landing behind a **Vercel login wall**, and live Stripe checkout was failing outright on a tax-code requirement that test mode never enforced.

## Code

Branch: [`claude/wayback-deployment-engine-gwapnu`](https://github.com/farmadvisorar-ux/chatbot/tree/claude/wayback-deployment-engine-gwapnu) (all work lives in `dareal-tyte/`)

The bug-smash commits, in the order they were found:

- [`9af87b2`](https://github.com/farmadvisorar-ux/chatbot/commit/9af87b2) — Fix CDX query only ever matching one (or zero) snapshots
- [`0561713`](https://github.com/farmadvisorar-ux/chatbot/commit/0561713) — Fix snapshot lookup timing out on large sites
- [`c733754`](https://github.com/farmadvisorar-ux/chatbot/commit/c733754) — Move snapshot lookup server-side after repeatable Safari failure
- [`a9f9839`](https://github.com/farmadvisorar-ux/chatbot/commit/a9f9839) — Fix recovered-site preview links being walled behind Vercel login
- [`8f08dd1`](https://github.com/farmadvisorar-ux/chatbot/commit/8f08dd1) — Fix live checkout failing on Managed Payments tax code requirement
- [`e81a875`](https://github.com/farmadvisorar-ux/chatbot/commit/e81a875) — Fix snapshot list showing only a domain's oldest captures
- [`f9aa261`](https://github.com/farmadvisorar-ux/chatbot/commit/f9aa261) — Make snapshot list span a domain's full archived history

## My Improvements

### Bug 1: the query matched almost nothing

The original CDX query looked reasonable:

```ts
{ url: domain, matchType: 'exact', filter: 'statuscode:200' }
```

`matchType=exact` against `example.com` matches captures recorded in *exactly* that form. But the Wayback Machine records the URL the crawler actually visited — `https://www.example.com/`, `http://example.com/`, with or without the trailing slash. The bare string is one of the rarest forms in the index.

**One snapshot wasn't a pagination bug. It was a near-total miss.**

### Bug 2: fixing the match broke the timeout

Obvious fix: `matchType=domain` (match the whole host), then filter back down to homepage URLs with a server-side regex:

```ts
params.append('filter', `original:^https?://(www\\.)?${escapeRegex(domain)}/?$`);
```

Correct — and unusable. For a domain like `walmart.com`, the CDX server has to walk the site's *entire* page history before it can apply that filter. It reliably blew the client timeout:

> Could not reach the Wayback Machine CDX API: Fetch is aborted

The real fix was to stop making the server do a linear scan at all: fire **two parallel `matchType=exact` queries** — bare host and `www.` — and merge them. Exact lookups are indexed by SURT key, so they're fast regardless of site size.

```ts
const bare = trimmed.replace(/^www\./i, '');
const results = await Promise.allSettled(
    [bare, `www.${bare}`].map((v) => fetchOne(v, controller.signal)),
);
```

`Promise.allSettled`, not `Promise.all` — one slow variant shouldn't sink a good result from the other.

**Trade-off I accepted:** this only covers those two host variants. A homepage archived solely under some other subdomain won't appear. Speed was worth more than exhaustiveness here.

### Bug 3: the browser couldn't make the request at all

This one inverted an assumption I'd built the whole module around.

A sibling project in the same repo had documented that `web.archive.org` silently drops or resets requests from datacenter IPs — so I'd deliberately put the CDX lookup **client-side**, in the visitor's browser, to route around it.

Real-world testing said otherwise. Safari on iOS returned a flat `Load failed` on the cross-origin fetch, repeatably. Meanwhile the *server-side* fetches in `/api/recover` and `/api/launch` had been working in production the whole time, including against a large site.

I moved the lookup to a new `/api/snapshots` endpoint — following the evidence rather than the inherited assumption, and documenting that reversal in the module header so the next person doesn't "fix" it back:

```ts
/**
 * This started as a browser-side module (see git history)... In practice
 * here it failed differently: browsers got "Load failed" from a direct
 * cross-origin fetch, while server-side fetches from this same Vercel
 * project have worked reliably in production. Moved server-side on that
 * evidence.
 */
```

### Bugs 4 & 5: truncating from the wrong end, twice

With the endpoint finally reachable, I could see real output for the first time. It returned **566 snapshots** for `walmart.com` — a huge improvement over one.

Every single one was from **1996–2006**.

CDX returns rows oldest-first. `limit: 1000` takes the first thousand — which, for a domain archived since the dot-com era, is entirely its first decade. Nothing from this century's second half made the cut.

Easy fix: negative limit means "most recent N."

```ts
limit: '-1000'
```

Re-tested. Newest snapshot: today. Oldest: **five months ago.**

Same bug, mirrored. The row budget was still being spent on one dense slice of history — just the other end. And for this product that's arguably worse: someone restoring an expired domain usually wants a capture from *before* it went dark, which could be years back.

The actual fix was to stop fighting over which end to truncate and change what a row *is* — collapse to one capture per month server-side, so the budget spans the domain's whole lifetime:

```ts
collapse: 'timestamp:6',  // one capture per month
limit: '-600',            // newest 600 months, if a domain somehow exceeds that
```

Verified live across three domains:

| Domain | Entries | Range | Distinct years |
|---|---|---|---|
| walmart.com | 295 | 1996 → 2026 | 30 |
| toysrus.com | 228 | 1996 → 2026 | 29 |
| example.com | 255 | 2002 → 2026 | 24 |

From one snapshot to thirty years of them.

### Two bonus production bugs

**Every deployed site was behind a login wall.** Users clicked their finished deployment and landed on a Vercel sign-in page. The team account had `ssoProtection: all_except_custom_domains` as a default, which auto-protects every new project's `*.vercel.app` URL. I reproduced it (302 → `vercel.com/sso-api`), patched a test project, confirmed 200 with real content, then made the deploy path disable it automatically:

```ts
const isPublic = await disableDeploymentProtection(projectId);
```

Deliberately best-effort — a settings tweak failing shouldn't fail a deployment that already succeeded. It surfaces as `public: false` in the response and a visible warning in the UI, rather than silently handing someone a broken link.

**Live Stripe checkout failed on day one.** Test mode worked perfectly. Live mode returned:

> Invalid line_items[0]: the product tax code is missing... Product tax code is required for Managed Payments, which is enabled by default on your account.

A whole class of bug that only exists in production. I reproduced it directly against Stripe's API before touching code, then opted the session out of Managed Payments — rather than inventing a tax classification, since whether to collect sales tax is a business decision, not a code one.

### The meta-lesson

Every one of these five bugs was invisible to the test suite. The unit tests were green the entire time — because they tested my *parsing* logic, and every bug was in the *query* I sent or the *transport* I sent it over.

Four of them were only findable by hitting the live endpoint and reading actual output. The 1996–2006 bug in particular looked like a total success from every angle except one: 566 results, HTTP 200, tests passing, correct shape. You had to actually *look at the dates*.

## Best Use of Sentry

*Not submitting to this category — DAREALTYTE doesn't currently use Sentry.*

Worth being straight about it, since this project is a decent argument for adding it. Bugs 4 and 5 both returned `HTTP 200` with well-formed payloads. Error monitoring wouldn't have flagged either one; nothing threw. What would have caught them is exactly what I ended up doing by hand — inspecting real production responses and noticing the *values* were wrong even though the *shape* was right.

The one place Sentry would have paid off immediately is Bug 3. The Safari `Load failed` was reported to me as a screenshot from a phone, with no stack trace and no way to reproduce it in my own environment. A Session Replay or a captured client-side exception would have turned a multi-round guessing game into a single look.

## Best Use of Google AI

*Not submitting to this category — no Google AI products are used in this project.*
