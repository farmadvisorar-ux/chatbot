import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCdxJson, collapseToDaily, formatTimestamp } from '../src/lib/cdx.ts';

test('parseCdxJson drops the header row', () => {
    const raw = [
        ['timestamp', 'statuscode'],
        ['20200101000000', '200'],
        ['20220101000000', '200'],
    ];
    assert.deepEqual(parseCdxJson(raw), [
        { timestamp: '20200101000000', statuscode: '200' },
        { timestamp: '20220101000000', statuscode: '200' },
    ]);
});

test('parseCdxJson tolerates malformed input', () => {
    assert.deepEqual(parseCdxJson(null), []);
    assert.deepEqual(parseCdxJson([]), []);
    assert.deepEqual(parseCdxJson([['timestamp', 'statuscode']]), []);
});

test('collapseToDaily merges multiple captures on the same day and sorts newest-first', () => {
    const snapshots = [
        { timestamp: '20200101000000', statuscode: '200' },
        { timestamp: '20220101000000', statuscode: '200' },
        { timestamp: '20220101120000', statuscode: '200' }, // same day as above
        { timestamp: '20210101000000', statuscode: '200' },
    ];
    assert.deepEqual(collapseToDaily(snapshots).map((s) => s.timestamp), ['20220101000000', '20210101000000', '20200101000000']);
});

test('collapseToDaily merges snapshots from different host variants (bare + www)', () => {
    // Simulates results from two separate exact-match queries being combined.
    const bare = [{ timestamp: '20210101000000', statuscode: '200' }];
    const www = [{ timestamp: '20220101000000', statuscode: '200' }];
    assert.deepEqual(collapseToDaily([...bare, ...www]).map((s) => s.timestamp), ['20220101000000', '20210101000000']);
});

test('formatTimestamp renders a 14-digit Wayback timestamp as a readable date', () => {
    const formatted = formatTimestamp('20220115143000');
    assert.match(formatted, /Jan 15, 2022/);
});

test('formatTimestamp falls back to the raw value if unparseable', () => {
    assert.equal(formatTimestamp('not-a-timestamp'), 'not-a-timestamp');
});
