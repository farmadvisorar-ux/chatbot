import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SCHEMA_SQL } from '../api/_lib/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('the inlined schema is byte-identical to db/schema.sql', () => {
    // api/_lib/schema.ts exists because a serverless function has no reliable
    // filesystem to read the .sql from. Two copies of a schema is exactly the
    // kind of duplication that silently drifts — one gets a column the other
    // never hears about — so the only thing making it safe is this assertion.
    const onDisk = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
    assert.equal(
        SCHEMA_SQL,
        onDisk,
        'api/_lib/schema.ts has drifted from db/schema.sql — regenerate it',
    );
});

test('the schema creates the tables the application queries', () => {
    // Guards against a rename landing in one place and not the query that
    // reads it, which typechecking cannot catch inside a SQL string.
    for (const table of ['ad_campaigns', 'publishers', 'rate_limit_events']) {
        assert.ok(
            SCHEMA_SQL.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
            `schema no longer creates ${table}`,
        );
    }
});

test('the schema is safe to apply more than once', () => {
    // The migrate endpoint can be called repeatedly; anything non-idempotent
    // would fail the second run, or worse, destroy data on it.
    const creates = SCHEMA_SQL.match(/CREATE (TABLE|INDEX|EXTENSION)[^;]*/g) || [];
    for (const statement of creates) {
        assert.ok(
            /IF NOT EXISTS/.test(statement),
            `not idempotent: ${statement.split('\n')[0].slice(0, 60)}`,
        );
    }
    assert.ok(!/\bDROP\b/i.test(SCHEMA_SQL), 'schema contains a DROP');
});
