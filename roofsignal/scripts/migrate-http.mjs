import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

/**
 * Applies db/schema.sql over Neon's HTTP endpoint instead of a Postgres
 * connection, for networks that block outbound port 5432.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

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
    process.exit(1);
}
console.log(`Using ${found}`);

const sql = neon(process.env[found]);
const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

const statements = schema
    .split(/;\s*\n/)
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0 && !statement.startsWith('--'));

try {
    await sql.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    for (const statement of statements) {
        await sql.query(statement);
        const firstLine = statement.split('\n').find(line => line.trim() && !line.trim().startsWith('--')) || '';
        console.log('  applied:', firstLine.trim().slice(0, 72));
    }
    const rows = await sql.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' ORDER BY table_name`,
    );
    console.log('\nSchema applied. Tables now present:', rows.map(r => r.table_name).join(', '));
} catch (err) {
    console.error('Migration failed:', err.message || err);
    process.exitCode = 1;
}
