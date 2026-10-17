import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCdxJson, collapseToMonthly } from '../api/_lib/cdx.ts';

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

test('collapseToMonthly keeps one capture per month and sorts newest-first', () => {
    const snapshots = [
        { timestamp: '20200101000000', statuscode: '200' },
        { timestamp: '20220105000000', statuscode: '200' },
        { timestamp: '20220128120000', statuscode: '200' }, // same month as above
        { timestamp: '20210101000000', statuscode: '200' },
    ];
    assert.deepEqual(
        collapseToMonthly(snapshots).map((s) => s.timestamp),
        ['20220128120000', '20210101000000', '20200101000000'],
    );
});

test('collapseToMonthly keeps the newest capture within a month', () => {
    const snapshots = [
        { timestamp: '20220103000000', statuscode: '200' },
        { timestamp: '20220127000000', statuscode: '200' },
        { timestamp: '20220115000000', statuscode: '200' },
    ];
    assert.deepEqual(collapseToMonthly(snapshots).map((s) => s.timestamp), ['20220127000000']);
});

test('collapseToMonthly merges snapshots from different host variants (bare + www)', () => {
    // Simulates results from two separate exact-match queries being combined:
    // same month from each variant must not produce two entries.
    const bare = [{ timestamp: '20210101000000', statuscode: '200' }, { timestamp: '20220104000000', statuscode: '200' }];
    const www = [{ timestamp: '20220119000000', statuscode: '200' }];
    assert.deepEqual(
        collapseToMonthly([...bare, ...www]).map((s) => s.timestamp),
        ['20220119000000', '20210101000000'],
    );
});
