import pg from 'pg';

declare global {
    // eslint-disable-next-line no-var
    var __sikadsPool: pg.Pool | undefined;
}

/**
 * Whether a database is wired up at all. Endpoints check this before touching
 * getPool() so a half-configured deployment answers with a clear "not set up
 * yet" instead of a raw FUNCTION_INVOCATION_FAILED, which tells an operator
 * nothing and looks like a crash to anyone watching.
 */
export function isDatabaseConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
}

export function getPool(): pg.Pool {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not configured');
    }
    if (!globalThis.__sikadsPool) {
        globalThis.__sikadsPool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return globalThis.__sikadsPool;
}
