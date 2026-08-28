import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

/**
 * Applies db/schema.sql over Neon's HTTP endpoint instead of a Postgres
 * connection.
 *
 * `npm run migrate` speaks the wire protocol on port 5432, which sandboxes and
 * corporate networks routinely block outbound — the migration then hangs or is
 * refused with nothing to say why. This path is plain HTTPS, so it works
 * anywhere a browser would, at the cost of being Neon-specific.
 *
 * Statements are split and sent one at a time because the HTTP endpoint takes
 * a single statement per call, unlike a real session.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

// Same resolution order as api/_lib/db.ts, so the schema always lands in the
// database the application actually reads from.
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

// Split on statement terminators that end a line, which keeps the CHECK
// constraints intact.
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
