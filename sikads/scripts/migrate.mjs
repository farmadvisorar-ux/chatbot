import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Same order as api/_lib/db.ts. Kept in step deliberately: if the app can
// reach a database under one of these names, migrating must reach the same
// one, or the schema lands somewhere the app never looks.
const URL_VARS = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
];

const found = URL_VARS.find(name => process.env[name]);
if (!found) {
    console.error(`No database connection string found. Set one of:\n  ${URL_VARS.join('\n  ')}`);
    console.error('\nCopy .env.example to .env and fill it in, or export it in your shell.');
    console.error('Pulling them from Vercel works too:  npx vercel env pull .env');
    process.exit(1);
}
console.log(`Using ${found}`);

// Mirrors sslFor() in api/_lib/db.ts: hosted Postgres requires TLS, a local
// one usually has it off and rejects the attempt outright.
const conn = process.env[found];
const ssl = /[?&]sslmode=disable/.test(conn)
    || /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(conn)
    || /[?&]host=%2F|[?&]host=\//.test(conn)
    ? false
    : { rejectUnauthorized: false };

const sql = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const pool = new pg.Pool({ connectionString: conn, ssl });

try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query(sql);
    const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`,
    );
    console.log('Schema applied. Tables now present:', rows.map(r => r.table_name).join(', '));
} catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
} finally {
    await pool.end();
}
