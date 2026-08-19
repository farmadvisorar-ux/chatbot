import type pg from 'pg';

/**
 * Best-effort per-IP rate limit backed by Postgres (serverless functions
 * have no shared memory between instances, so in-process counters don't work).
 *
 * Insert-then-count rather than check-then-insert: under concurrency the older
 * pattern let every racer pass the count check before any of them wrote a row.
 * Recording first means a burst can slightly overshoot the limit, never ignore
 * it. Old rows are pruned opportunistically so the table cannot grow forever.
 */
export async function checkRateLimit(
    pool: pg.Pool,
    bucket: string,
    key: string,
    limit: number,
    windowMinutes: number,
): Promise<boolean> {
    const { rows } = await pool.query<{ count: string }>(
        `WITH pruned AS (
             DELETE FROM rate_limit_events
             WHERE created_at < now() - (($3::text || ' minutes')::interval * 4)
             RETURNING 1
         ),
         inserted AS (
             INSERT INTO rate_limit_events (bucket, client_key)
             VALUES ($1, $2)
             RETURNING 1
         )
         SELECT count(*)::text AS count FROM rate_limit_events
         WHERE bucket = $1 AND client_key = $2
           AND created_at > now() - ($3::text || ' minutes')::interval`,
        [bucket, key, windowMinutes],
    );
    return Number(rows[0]?.count ?? 0) <= limit;
}
