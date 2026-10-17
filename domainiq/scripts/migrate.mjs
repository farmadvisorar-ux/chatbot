import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in, or export it in your shell.');
    process.exit(1);
}

const sql = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

try {
    await pool.query(sql);
    console.log('Schema applied successfully.');
} catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
} finally {
    await pool.end();
}
