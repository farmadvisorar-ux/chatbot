import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { splitSqlStatements } from '../scripts/split-sql.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');

/**
 * The HTTP migration sends one statement at a time, so it depends entirely on
 * this split. Every statement in db/schema.sql is preceded by a comment block;
 * a splitter that decides what to keep by looking at the first character
 * silently drops the CREATE TABLE that follows a comment, leaving a database
 * with indexes and no tables — exactly the fallback path an operator reaches
 * for when port 5432 is blocked.
 */
test('every statement in the schema survives the split', () => {
    const statements = splitSqlStatements(schema);
    for (const table of ['ad_campaigns', 'publishers', 'rate_limit_events']) {
        assert.ok(
            statements.some(s => s.startsWith(`CREATE TABLE IF NOT EXISTS ${table}`)),
            `migrate:http would not create ${table}`,
        );
    }
    // pgcrypto is required before publishers can mint slot keys with
    // gen_random_bytes(), so the extension has to make it through too.
    assert.ok(
        statements.some(s => s.startsWith('CREATE EXTENSION IF NOT EXISTS pgcrypto')),
        'migrate:http would not create the pgcrypto extension',
    );
});

test('the split drops nothing and invents nothing', () => {
    const statements = splitSqlStatements(schema);
    // One statement per terminating semicolon, no more and no fewer.
    const semicolons = (schema.match(/;\s*\n/g) || []).length;
    assert.equal(statements.length, semicolons, 'statement count does not match the schema');
    // No statement is left as a bare comment or empty string.
    for (const statement of statements) {
        assert.ok(statement.length > 0, 'produced an empty statement');
        assert.ok(!statement.startsWith('--'), `statement still begins with a comment: ${statement.slice(0, 40)}`);
    }
});
