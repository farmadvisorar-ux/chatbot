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
// Strip trailing inline comments (e.g. `ADD COLUMN foo TEXT; -- note`) before
// splitting on statement-terminating semicolons — otherwise a comment sitting
// between a `;` and the next newline hides the split point and glues that
// statement to the next one, which Neon's HTTP driver rejects outright
// ("cannot insert multiple commands into a prepared statement").
const withoutTrailingComments = schema.replace(/[ \t]+--[^\n]*(?=\n|$)/g, '');
const statements = withoutTrailingComments
    .split(/;\s*\n/)
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);

try {
    await sql.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    for (const statement of statements) {
        await sql.query(statement);
        console.log('Applied:', statement.split('\n')[0].slice(0, 70));
    }
    console.log('Schema applied successfully via HTTP driver.');
} catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
}
