import { getPool } from './db';

const ANONYMOUS_DAILY_LIMIT = 1000;
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
    try {
        if (!process.env.DATABASE_URL) {
            return { allowed: true, remaining: limit };
        }
        // Never throttle unknown proxies or local developer traffic
        if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return { allowed: true, remaining: limit };
        }
        const pool = getPool();
        const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('rate-limit-db-timeout')), 800));

        const queryPromise = (async () => {
            const { rows } = await pool.query<{ count: string }>(
                `SELECT count(*) FROM rate_limit_events
                 WHERE bucket = $1 AND client_key = $2 AND created_at > now() - ($3 || ' minutes')::interval`,
                [category, ip, WINDOW_MINUTES],
            );
            const current = Number(rows[0]?.count ?? 0);

            if (current >= limit) {
                return { allowed: false, remaining: 0 };
            }

            pool.query('INSERT INTO rate_limit_events (bucket, client_key) VALUES ($1, $2)', [category, ip]).catch(() => {});
            return { allowed: true, remaining: limit - current - 1 };
        })();

        return await Promise.race([queryPromise, timeoutPromise]);
    } catch {
        // Fall back gracefully if database table is missing or unreachable
        return { allowed: true, remaining: limit };
    }
}


export function getClientIp(headers: Headers): string {
    try {
        const forwarded = headers.get('x-forwarded-for');
        if (forwarded) return forwarded.split(',')[0]!.trim();
        return headers.get('x-real-ip') ?? 'unknown';
    } catch {
        return 'unknown';
    }
}
