import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SCHEMA_SQL } from '../api/_lib/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('the inlined schema is byte-identical to db/schema.sql', () => {
    const onDisk = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
    assert.equal(
        SCHEMA_SQL,
        onDisk,
        'api/_lib/schema.ts has drifted from db/schema.sql — regenerate it',
    );
});

test('the schema creates the tables the application queries', () => {
    for (const table of ['leads', 'call_logs', 'messages', 'appointments', 'photos', 'inspection_summaries', 'rate_limit_events']) {
        assert.ok(
            SCHEMA_SQL.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
            `schema no longer creates ${table}`,
        );
    }
});

test('the schema is safe to apply more than once', () => {
    const creates = SCHEMA_SQL.match(/CREATE (TABLE|INDEX|EXTENSION)[^;]*/g) || [];
    for (const statement of creates) {
        assert.ok(
            /IF NOT EXISTS/.test(statement),
            `not idempotent: ${statement.split('\n')[0].slice(0, 60)}`,
        );
    }
    assert.ok(!/\bDROP\b/i.test(SCHEMA_SQL), 'schema contains a DROP');
});
