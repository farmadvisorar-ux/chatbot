import pg from 'pg';

declare global {
    // eslint-disable-next-line no-var
    var __roofsignalPool: pg.Pool | undefined;
}

/**
 * Connection-string variables, in the order we trust them. Pooled URLs come
 * first — serverless functions open a connection per invocation, which is
 * exactly what a pooler exists to absorb.
 */
const URL_VARS = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
] as const;

export function databaseUrl(): string | null {
    for (const name of URL_VARS) {
        const value = process.env[name];
        if (value) return value;
    }
    return null;
}

export function isDatabaseConfigured(): boolean {
    return databaseUrl() !== null;
}

/**
 * Hosted Postgres (Neon, Supabase, Vercel) requires TLS; a Postgres someone
 * runs on their own machine usually has it switched off. Detected rather than
 * configured, so neither case needs a flag set to work.
 */
export function sslFor(connectionString: string): { rejectUnauthorized: boolean } | false {
    if (/[?&]sslmode=disable/.test(connectionString)) return false;
    if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString)) return false;
    if (/[?&]host=%2F|[?&]host=\//.test(connectionString)) return false;
    return { rejectUnauthorized: false };
}

export function getPool(): pg.Pool {
    const connectionString = databaseUrl();
    if (!connectionString) {
        throw new Error(`No database connection string. Set one of: ${URL_VARS.join(', ')}`);
    }
    if (!globalThis.__roofsignalPool) {
        globalThis.__roofsignalPool = new pg.Pool({
            connectionString,
            ssl: sslFor(connectionString),
            max: 3,
        });
    }
    return globalThis.__roofsignalPool;
}
