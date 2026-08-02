import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCdxParams, parseCdxJson, formatTimestamp } from '../src/lib/cdx.ts';

test('buildCdxParams matches the host broadly, then restricts to homepage variants via regex', () => {
    const params = buildCdxParams('example.com');
    assert.equal(params.get('url'), 'example.com');
    assert.equal(params.get('matchType'), 'domain');
    const filters = params.getAll('filter');
    assert.ok(filters.includes('statuscode:200'));
    const rootFilter = filters.find((f) => f.startsWith('original:'));
    assert.ok(rootFilter, 'expected an original: regex filter');
    assert.match('https://www.example.com/', new RegExp(rootFilter.slice('original:'.length)));
    assert.match('https://example.com', new RegExp(rootFilter.slice('original:'.length)));
    assert.doesNotMatch('https://example.com/some/page', new RegExp(rootFilter.slice('original:'.length)));
});

test('buildCdxParams escapes regex-special characters in the domain', () => {
    const params = buildCdxParams('my-site.example.com');
    const rootFilter = params.getAll('filter').find((f) => f.startsWith('original:'));
    // A literal dot in the pattern must not accidentally match "myXsite" etc.
    assert.doesNotMatch('https://myXsite.example.com/', new RegExp(rootFilter.slice('original:'.length)));
    assert.match('https://my-site.example.com/', new RegExp(rootFilter.slice('original:'.length)));
});

test('parseCdxJson drops the header row, collapses to one-per-day, and sorts newest-first', () => {
    const raw = [
        ['timestamp', 'statuscode'],
        ['20200101000000', '200'],
        ['20220101000000', '200'],
        ['20220101120000', '200'], // same day as above -- should collapse away
        ['20210101000000', '200'],
    ];
    const snapshots = parseCdxJson(raw);
    assert.deepEqual(snapshots.map((s) => s.timestamp), ['20220101000000', '20210101000000', '20200101000000']);
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
