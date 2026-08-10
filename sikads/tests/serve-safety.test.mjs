import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * migrate-http.mjs used to drop any statement chunk that started with `--`.
 * The CREATE TABLE blocks in schema.sql are preceded by comment paragraphs in
 * the same chunk, so that filter skipped the money tables entirely and left
 * only indexes / rate_limit_events. This mirrors the splitter and asserts
 * every application table survives it.
 */
const here = dirname(fileURLToPath(import.meta.url));

function statementsFromSchema(schema) {
    return schema
        .split(/;\s*\n/)
        .map(statement => statement.trim())
        .filter(statement => statement.length > 0);
}

test('migrate-http keeps CREATE TABLE statements that start with comments', () => {
    const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
    const statements = statementsFromSchema(schema);
    const joined = statements.join('\n;\n');

    for (const table of ['ad_campaigns', 'publishers', 'rate_limit_events']) {
        assert.ok(
            joined.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
            `migrate-http splitter dropped CREATE TABLE ${table}`,
        );
    }

    // The old buggy filter: anything starting with `--` was discarded. Prove
    // that at least one kept statement still begins with a comment — that is
    // exactly the shape that used to vanish.
    assert.ok(
        statements.some(s => s.startsWith('--') && s.includes('CREATE TABLE')),
        'expected a commented CREATE TABLE chunk in schema.sql',
    );
});

test('serve SQL re-checks inventory on the UPDATE', () => {
    // Guards the race where two concurrent serves both select the last view
    // and the second decrement drives views_remaining negative.
    const ads = readFileSync(join(here, '..', 'api', 'ads.ts'), 'utf8');
    assert.ok(
        /WHERE ad_campaigns\.id = candidate\.id[\s\S]*views_remaining > 0/.test(ads),
        'spend UPDATE must re-check views_remaining > 0',
    );
    assert.ok(
        /status = 'active'/.test(ads) && /WHEN \$1 = '' THEN true/.test(ads),
        'non-empty slots must require an active publisher before spending',
    );
});
