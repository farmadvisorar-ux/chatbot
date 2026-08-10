import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { splitSchemaStatements } from '../scripts/split-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');

test('HTTP migrate keeps CREATE TABLE statements that start with comments', () => {
    // The old filter dropped any chunk whose first characters were `--`, which
    // is how every table in schema.sql is introduced. Indexes then failed
    // because the tables never existed.
    const statements = splitSchemaStatements(schema);
    for (const table of ['ad_campaigns', 'publishers', 'rate_limit_events']) {
        assert.ok(
            statements.some(s => s.includes(`CREATE TABLE IF NOT EXISTS ${table}`)),
            `splitSchemaStatements dropped CREATE TABLE ${table}`,
        );
    }
});

test('HTTP migrate never sends a comment-only statement', () => {
    const statements = splitSchemaStatements(schema);
    for (const statement of statements) {
        assert.ok(!/^\s*--/.test(statement), `comment-only chunk survived: ${statement.slice(0, 40)}`);
        assert.ok(statement.length > 0);
    }
});
