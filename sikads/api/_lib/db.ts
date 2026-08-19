import pg from 'pg';

declare global {
    // eslint-disable-next-line no-var
    var __sikadsPool: pg.Pool | undefined;
}

/**
 * Connection-string variables, in the order we trust them.
 *
 * Only DATABASE_URL was read originally, which quietly broke provisioning
 * through Vercel's marketplace: the Neon integration writes a whole family of
 * variables, and which ones appear depends on the integration and its version.
 * A deployment could have a perfectly good database attached and still report
 * itself unconfigured because the value happened to land under another name.
 *
 * Pooled URLs come first — serverless functions open a connection per
 * invocation, which is exactly what a pooler exists to absorb. The unpooled
 * variants are last-resort fallbacks so a database is reachable rather than
 * unreachable, but they will exhaust connections faster under load.
 */
const URL_VARS = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
] as const;

/** The first connection string that is actually present, or null. */
export function databaseUrl(): string | null {
    for (const name of URL_VARS) {
        const value = process.env[name];
        if (value) return value;
    }
    return null;
}

/**
 * Whether a database is wired up at all. Endpoints check this before touching
 * getPool() so a half-configured deployment answers with a clear "not set up
 * yet" instead of a raw FUNCTION_INVOCATION_FAILED, which tells an operator
 * nothing and looks like a crash to anyone watching.
 */
export function isDatabaseConfigured(): boolean {
    return databaseUrl() !== null;
}

/**
 * Hosted Postgres (Neon, Supabase, Vercel) requires TLS; a Postgres someone
 * runs on their own machine usually has it switched off, and demanding it
 * there fails with "server does not support SSL connections". Detected rather
 * than configured, so neither case needs a flag set to work.
 */
export function sslFor(connectionString: string): { rejectUnauthorized: boolean } | false {
    if (/[?&]sslmode=disable/.test(connectionString)) return false;
    if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString)) return false;
    // A unix-socket connection never crosses a network, so TLS is moot.
    if (/[?&]host=%2F|[?&]host=\//.test(connectionString)) return false;
    return { rejectUnauthorized: false };
}

export function getPool(): pg.Pool {
    const connectionString = databaseUrl();
    if (!connectionString) {
        throw new Error(`No database connection string. Set one of: ${URL_VARS.join(', ')}`);
    }
    if (!globalThis.__sikadsPool) {
        globalThis.__sikadsPool = new pg.Pool({
            connectionString,
            ssl: sslFor(connectionString),
            max: 3,
        });
    }
    return globalThis.__sikadsPool;
}
