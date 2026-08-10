import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toPrintfulExternalId, fromPrintfulExternalId } from '../api/_lib/printful.ts';
import { mergeQuantitiesByKey, clampQuantity } from '../api/_lib/cart.ts';

test('Printful external_id strips UUID hyphens to stay within the 32-char limit', () => {
    const orderId = '123e4567-e89b-12d3-a456-426614174000';
    const external = toPrintfulExternalId(orderId);
    assert.equal(external.length, 32);
    assert.equal(external, '123e4567e89b12d3a456426614174000');
    assert.equal(fromPrintfulExternalId(external), orderId);
});

test('fromPrintfulExternalId leaves already-hyphenated ids alone', () => {
    const orderId = '123e4567-e89b-12d3-a456-426614174000';
    assert.equal(fromPrintfulExternalId(orderId), orderId);
});

test('duplicate cart lines merge and clamp instead of bypassing the qty cap', () => {
    const merged = mergeQuantitiesByKey(
        [
            { variantId: 'a', quantity: 8 },
            { variantId: 'a', quantity: 8 },
            { variantId: 'b', quantity: 2 },
        ],
        item => item.variantId,
    );
    assert.equal(merged.length, 2);
    assert.equal(merged.find(i => i.variantId === 'a')?.quantity, clampQuantity(16));
    assert.equal(merged.find(i => i.variantId === 'b')?.quantity, 2);
});
