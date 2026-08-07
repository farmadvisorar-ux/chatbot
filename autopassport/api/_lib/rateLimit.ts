import type pg from 'pg';

/**
 * Best-effort per-IP rate limit backed by Postgres (serverless functions
 * have no shared memory between instances, so in-process counters don't work).
 */
export async function checkRateLimit(
    pool: pg.Pool,
    bucket: string,
    key: string,
    limit: number,
    windowMinutes: number,
): Promise<boolean> {
    const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM rate_limit_events
         WHERE bucket = $1 AND client_key = $2 AND created_at > now() - ($3 || ' minutes')::interval`,
        [bucket, key, windowMinutes],
    );
    if (Number(rows[0]?.count ?? 0) >= limit) return false;
    await pool.query('INSERT INTO rate_limit_events (bucket, client_key) VALUES ($1, $2)', [bucket, key]);

    // Nothing ever deletes old rows otherwise, so this table grows forever.
    // A random 1-in-50 chance of sweeping everything past a generous 1-day
    // window (every window used in this app is well under an hour) bounds
    // its size without needing a cron job or slowing down every request.
    if (Math.random() < 0.02) {
        await pool.query(`DELETE FROM rate_limit_events WHERE created_at < now() - interval '1 day'`);
    }

    return true;
}
