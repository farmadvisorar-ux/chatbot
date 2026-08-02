import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimestamp } from '../src/lib/format.ts';

test('formatTimestamp renders a 14-digit Wayback timestamp as a readable date', () => {
    const formatted = formatTimestamp('20220115143000');
    assert.match(formatted, /Jan 15, 2022/);
});

test('formatTimestamp falls back to the raw value if unparseable', () => {
    assert.equal(formatTimestamp('not-a-timestamp'), 'not-a-timestamp');
});
