import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNextSlot } from '../api/_lib/scheduling.ts';

// A pool stub with no existing appointments — findNextSlot should just walk
// forward to the next open business hour.
const emptyPool = { query: async () => ({ rows: [] }) };

function chicagoParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', hour12: false, weekday: 'short',
    }).formatToParts(date);
    return {
        hour: Number(parts.find(p => p.type === 'hour').value) % 24,
        weekday: parts.find(p => p.type === 'weekday').value,
    };
}

test('a slot found from a Sunday afternoon lands Mon-Sat, 8am-4pm start', async () => {
    // A known Sunday: 2026-08-09 is a Sunday.
    const sunday = new Date('2026-08-09T20:00:00Z');
    const { start, end } = await findNextSlot(emptyPool, sunday);
    const { hour, weekday } = chicagoParts(start);

    assert.notEqual(weekday, 'Sun');
    assert.ok(hour >= 8 && hour <= 16, `slot starts at hour ${hour}, outside 8am-5pm`);
    assert.equal(end.getTime() - start.getTime(), 60 * 60 * 1000);
});

test('a slot is always exactly 60 minutes', async () => {
    const { start, end } = await findNextSlot(emptyPool, new Date());
    assert.equal(end.getTime() - start.getTime(), 60 * 60 * 1000);
});

test('a fully-booked business day is skipped', async () => {
    // Every candidate conflicts, forcing the search past at least one day.
    let calls = 0;
    const alwaysBusyThenFree = {
        query: async () => {
            calls += 1;
            return { rows: calls <= 9 ? [{ x: 1 }] : [] }; // busy the first ~9 candidates
        },
    };
    const { start } = await findNextSlot(alwaysBusyThenFree, new Date('2026-08-10T13:00:00Z'));
    assert.ok(start instanceof Date);
});
