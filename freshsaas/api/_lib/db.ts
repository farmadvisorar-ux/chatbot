import pg from 'pg';

declare global {
    // eslint-disable-next-line no-var
    var __freshsaasPool: pg.Pool | undefined;
}

export function getPool(): pg.Pool {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not configured');
    }
    if (!globalThis.__freshsaasPool) {
        globalThis.__freshsaasPool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return globalThis.__freshsaasPool;
}
