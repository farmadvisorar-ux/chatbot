import { createHash } from 'node:crypto';
import type pg from 'pg';

/**
 * Best-effort per-IP rate limit backed by Postgres (serverless functions
 * have no shared memory between instances, so in-process counters don't work).
 *
 * Uses a transaction + advisory lock so concurrent requests for the same
 * bucket/key can't all pass a check-then-insert race.
 */
export async function checkRateLimit(
    pool: pg.Pool,
    bucket: string,
    key: string,
    limit: number,
    windowMinutes: number,
): Promise<boolean> {
    const lockKey = createHash('sha256').update(`${bucket}:${key}`).digest().readInt32BE(0);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
        const { rows } = await client.query<{ count: string }>(
            `SELECT count(*) FROM rate_limit_events
             WHERE bucket = $1 AND client_key = $2 AND created_at > now() - ($3 || ' minutes')::interval`,
            [bucket, key, windowMinutes],
        );
        if (Number(rows[0]?.count ?? 0) >= limit) {
            await client.query('ROLLBACK');
            return false;
        }
        await client.query('INSERT INTO rate_limit_events (bucket, client_key) VALUES ($1, $2)', [bucket, key]);
        await client.query('COMMIT');
        return true;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
    } finally {
        client.release();
    }
}
