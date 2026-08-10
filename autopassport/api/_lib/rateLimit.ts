import type pg from 'pg';

/**
 * Per-IP rate limit backed by Postgres. The transaction-scoped advisory lock
 * prevents simultaneous serverless invocations from all observing the same
 * count and slipping through together.
 */
export async function checkRateLimit(
    pool: pg.Pool,
    bucket: string,
    key: string,
    limit: number,
    windowMinutes: number,
): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [bucket, key]);

        const { rows } = await client.query<{ count: string }>(
            `SELECT count(*) FROM rate_limit_events
             WHERE bucket = $1 AND client_key = $2
               AND created_at > now() - make_interval(mins => $3)`,
            [bucket, key, windowMinutes],
        );
        const allowed = Number(rows[0]?.count ?? 0) < limit;
        if (allowed) {
            await client.query(
                'INSERT INTO rate_limit_events (bucket, client_key) VALUES ($1, $2)',
                [bucket, key],
            );
        }

        // The timestamp index keeps this inexpensive and prevents a small
        // abuse-control table from growing forever without a separate cron.
        await client.query(`DELETE FROM rate_limit_events WHERE created_at < now() - interval '1 day'`);
        await client.query('COMMIT');
        return allowed;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}
