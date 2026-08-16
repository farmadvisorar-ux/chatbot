import { getPool } from './db';

const ANONYMOUS_DAILY_LIMIT = 15;
const WINDOW_MINUTES = 24 * 60;

/**
 * Best-effort per-IP rate limit backed by Postgres — serverless functions
 * have no shared memory between invocations, so an in-process counter
 * wouldn't survive across requests. `category` keeps independent quotas
 * (e.g. single valuations vs. bulk checks) from sharing one counter per IP.
 */
export async function checkAndConsumeRateLimit(
    ip: string,
    limit: number = ANONYMOUS_DAILY_LIMIT,
    category: string = 'valuate',
): Promise<{ allowed: boolean; remaining: number }> {
    const pool = getPool();
    const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM rate_limit_events
         WHERE bucket = $1 AND client_key = $2 AND created_at > now() - ($3 || ' minutes')::interval`,
        [category, ip, WINDOW_MINUTES],
    );
    const current = Number(rows[0]?.count ?? 0);

    if (current >= limit) {
        return { allowed: false, remaining: 0 };
    }

    await pool.query('INSERT INTO rate_limit_events (bucket, client_key) VALUES ($1, $2)', [category, ip]);
    return { allowed: true, remaining: limit - current - 1 };
}

export function getClientIp(headers: Headers): string {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]!.trim();
    return headers.get('x-real-ip') ?? 'unknown';
}
