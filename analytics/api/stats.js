import { sql, ensureSchema, isDatabaseConfigured, isAdmin, json } from './_db.js';

/**
 * GET /api/stats?days=30 — everything the dashboard draws, in one round trip.
 *
 * One request rather than a dozen because each Neon HTTP query is its own
 * round trip; a dashboard that fired one per panel would spend most of its
 * load time waiting. The queries run concurrently.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return json(res, 405, { error: 'Method not allowed. Use GET.' });
    }
    if (!process.env.ADMIN_SECRET) {
        return json(res, 501, {
            error: 'ADMIN_SECRET is not set on this deployment, so the dashboard cannot be protected.',
        });
    }
    if (!isAdmin(req)) return json(res, 401, { error: 'Unauthorized' });
    if (!isDatabaseConfigured()) {
        return json(res, 501, { error: 'No database is configured on this deployment.' });
    }

    const requested = Number(req.query.days);
    const days = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 365) : 30;

    try {
        await ensureSchema();
        const db = sql();
        const since = `${days} days`;

        const [
            totals, daily, paths, referrers, countries, cities,
            devices, browsers, funnel, sizes, recent, live,
        ] = await Promise.all([
            db`SELECT count(DISTINCT visitor_hash)::int AS visitors,
                      count(DISTINCT session_id)::int AS sessions,
                      count(*) FILTER (WHERE event = 'page_view')::int AS pageviews,
                      count(*)::int AS events
               FROM analytics_events WHERE ts > now() - ${since}::interval`,

            db`SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
                      count(DISTINCT visitor_hash)::int AS visitors,
                      count(*) FILTER (WHERE event = 'page_view')::int AS pageviews,
                      count(*) FILTER (WHERE event = 'purchase')::int AS purchases
               FROM analytics_events WHERE ts > now() - ${since}::interval
               GROUP BY 1 ORDER BY 1`,

            db`SELECT coalesce(path, '(none)') AS label, count(*)::int AS n
               FROM analytics_events
               WHERE ts > now() - ${since}::interval AND event = 'page_view'
               GROUP BY 1 ORDER BY n DESC LIMIT 15`,

            db`SELECT coalesce(referrer_host, '(direct)') AS label,
                      count(DISTINCT session_id)::int AS n
               FROM analytics_events WHERE ts > now() - ${since}::interval
               GROUP BY 1 ORDER BY n DESC LIMIT 15`,

            db`SELECT coalesce(country, '??') AS label, count(DISTINCT visitor_hash)::int AS n
               FROM analytics_events WHERE ts > now() - ${since}::interval
               GROUP BY 1 ORDER BY n DESC LIMIT 15`,

            db`SELECT coalesce(city, '(unknown)') || CASE WHEN region IS NOT NULL
                        THEN ', ' || region ELSE '' END AS label,
                      count(DISTINCT visitor_hash)::int AS n
               FROM analytics_events
               WHERE ts > now() - ${since}::interval AND city IS NOT NULL
               GROUP BY 1 ORDER BY n DESC LIMIT 15`,

            db`SELECT coalesce(device, '?') AS label, count(DISTINCT session_id)::int AS n
               FROM analytics_events WHERE ts > now() - ${since}::interval
               GROUP BY 1 ORDER BY n DESC`,

            db`SELECT coalesce(browser, '?') AS label, count(DISTINCT session_id)::int AS n
               FROM analytics_events WHERE ts > now() - ${since}::interval
               GROUP BY 1 ORDER BY n DESC LIMIT 8`,

            // Sessions, not events: one shopper adding three shirts is one
            // person moving through the funnel, not three.
            db`SELECT event, count(DISTINCT session_id)::int AS n
               FROM analytics_events
               WHERE ts > now() - ${since}::interval
                 AND event IN ('page_view','add_to_cart','begin_checkout','purchase')
               GROUP BY 1`,

            db`SELECT props->>'size' AS label, count(*)::int AS n
               FROM analytics_events
               WHERE ts > now() - ${since}::interval
                 AND event IN ('add_to_cart','select_size') AND props->>'size' IS NOT NULL
               GROUP BY 1 ORDER BY n DESC`,

            db`SELECT to_char(ts, 'YYYY-MM-DD HH24:MI:SS') AS ts, event, path,
                      referrer_host, country, city, device, browser, props
               FROM analytics_events ORDER BY ts DESC LIMIT 60`,

            db`SELECT count(DISTINCT session_id)::int AS n
               FROM analytics_events WHERE ts > now() - interval '5 minutes'`,
        ]);

        const step = Object.fromEntries(funnel.map(row => [row.event, row.n]));
        const viewed = step.page_view ?? 0;
        const rate = n => (viewed ? Math.round((n / viewed) * 1000) / 10 : 0);

        return json(res, 200, {
            days,
            generatedAt: new Date().toISOString(),
            totals: totals[0],
            onlineNow: live[0]?.n ?? 0,
            daily,
            breakdowns: { paths, referrers, countries, cities, devices, browsers, sizes },
            funnel: [
                { step: 'Visited', n: viewed, pct: 100 },
                { step: 'Added to cart', n: step.add_to_cart ?? 0, pct: rate(step.add_to_cart ?? 0) },
                { step: 'Began checkout', n: step.begin_checkout ?? 0, pct: rate(step.begin_checkout ?? 0) },
                { step: 'Purchased', n: step.purchase ?? 0, pct: rate(step.purchase ?? 0) },
            ],
            recent,
        });
    } catch (err) {
        console.error('[stats]', err);
        return json(res, 500, { error: 'Could not read analytics.' });
    }
}
