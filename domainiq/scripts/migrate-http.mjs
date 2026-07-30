// Applies db/schema.sql over Neon's HTTP driver instead of a raw TCP
// connection. Use this from sandboxed environments that only allow
// outbound HTTPS (common in CI runners and hosted coding agents) — plain
// `npm run migrate` needs TCP port 5432, which those environments block.
// This only works against Neon databases; other Postgres providers need
// `npm run migrate` from an environment with TCP access instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const statements = schema
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

try {
    for (const statement of statements) {
        await sql(statement);
        console.log('Applied:', statement.split('\n')[0].slice(0, 70));
    }
    console.log('Schema applied successfully via HTTP driver.');
} catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
}
