import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clampQuantity, subtotalCents, MAX_QUANTITY_PER_ITEM } from '../api/_lib/cart.ts';

/**
 * This covers the arithmetic that decides what a real customer is charged at
 * checkout. None of these cases throws on its own — they would silently
 * charge the wrong amount instead.
 */

test('quantity is clamped into the sellable range', () => {
    assert.equal(clampQuantity(0), 1, 'zero should floor to the minimum, not disappear the line item');
    assert.equal(clampQuantity(-5), 1, 'negative quantities must not produce a negative charge');
    assert.equal(clampQuantity(3), 3);
    assert.equal(clampQuantity(MAX_QUANTITY_PER_ITEM), MAX_QUANTITY_PER_ITEM);
    assert.equal(clampQuantity(MAX_QUANTITY_PER_ITEM + 50), MAX_QUANTITY_PER_ITEM, 'above the ceiling should clamp, not pass through');
    assert.equal(clampQuantity(2.9), 2, 'fractional quantities are truncated, never rounded up into a bigger charge');
    assert.equal(clampQuantity(NaN), 1, 'a non-numeric quantity must not become NaN * price');
});

test('subtotal is the sum of unit price times quantity, and nothing else', () => {
    assert.equal(subtotalCents([]), 0);
    assert.equal(
        subtotalCents([{ unitPriceCents: 2500, quantity: 2 }, { unitPriceCents: 1000, quantity: 1 }]),
        6000,
    );
});

test('subtotal never goes negative for any in-range inputs', () => {
    for (let price = 1; price <= 10_000; price += 137) {
        for (let qty = 1; qty <= MAX_QUANTITY_PER_ITEM; qty++) {
            const total = subtotalCents([{ unitPriceCents: price, quantity: qty }]);
            assert.ok(total >= 0, `negative subtotal at price=${price} qty=${qty}`);
            assert.equal(total, price * qty);
        }
    }
});
