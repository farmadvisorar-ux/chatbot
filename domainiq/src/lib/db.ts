import pg from 'pg';

declare global {
    // eslint-disable-next-line no-var
    var __domainiqPool: pg.Pool | undefined;
}

export function getPool(): pg.Pool {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not configured. Copy .env.example to .env and set it.');
    }
    if (!globalThis.__domainiqPool) {
        globalThis.__domainiqPool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
            max: 3,
        });
    }
    return globalThis.__domainiqPool;
}
