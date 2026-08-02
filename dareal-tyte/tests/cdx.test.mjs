import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCdxParams, parseCdxJson, formatTimestamp } from '../src/lib/cdx.ts';

test('buildCdxParams requests an exact-match, one-per-day, 200-only listing', () => {
    const params = buildCdxParams('example.com');
    assert.equal(params.get('url'), 'example.com');
    assert.equal(params.get('matchType'), 'exact');
    assert.equal(params.get('filter'), 'statuscode:200');
    assert.equal(params.get('collapse'), 'timestamp:8');
});

test('parseCdxJson drops the header row and returns newest-first', () => {
    const raw = [
        ['timestamp', 'statuscode'],
        ['20200101000000', '200'],
        ['20220101000000', '200'],
        ['20210101000000', '200'],
    ];
    const snapshots = parseCdxJson(raw);
    assert.deepEqual(snapshots.map((s) => s.timestamp), ['20210101000000', '20220101000000', '20200101000000']);
});

test('parseCdxJson tolerates malformed input', () => {
    assert.deepEqual(parseCdxJson(null), []);
    assert.deepEqual(parseCdxJson([]), []);
    assert.deepEqual(parseCdxJson([['timestamp', 'statuscode']]), []);
});

test('formatTimestamp renders a 14-digit Wayback timestamp as a readable date', () => {
    const formatted = formatTimestamp('20220115143000');
    assert.match(formatted, /Jan 15, 2022/);
});

test('formatTimestamp falls back to the raw value if unparseable', () => {
    assert.equal(formatTimestamp('not-a-timestamp'), 'not-a-timestamp');
});
