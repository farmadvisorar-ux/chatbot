import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pooled } from '../api/_lib/cdx.ts';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('pooled preserves result order regardless of completion order', async () => {
    // Deliberately finish in reverse: results must still line up with inputs,
    // since the year sweep relies on positional correspondence.
    const tasks = [
        () => tick(30).then(() => 'a'),
        () => tick(20).then(() => 'b'),
        () => tick(1).then(() => 'c'),
    ];
    const results = await pooled(tasks, 3);
    assert.deepEqual(results.map((r) => r.value), ['a', 'b', 'c']);
});

test('pooled never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, () => async () => {
        active++;
        peak = Math.max(peak, active);
        await tick(5);
        active--;
        return true;
    });
    await pooled(tasks, 4);
    assert.ok(peak <= 4, `peak concurrency was ${peak}, expected <= 4`);
});

test('pooled isolates failures instead of aborting the batch', async () => {
    const tasks = [
        () => Promise.resolve('ok'),
        () => Promise.reject(new Error('boom')),
        () => Promise.resolve('also ok'),
    ];
    const results = await pooled(tasks, 2);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal(results[2].status, 'fulfilled');
    assert.equal(results[2].value, 'also ok');
});

test('pooled handles an empty task list without hanging', async () => {
    assert.deepEqual(await pooled([], 5), []);
});
