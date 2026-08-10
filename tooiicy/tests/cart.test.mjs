import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clampQuantity, mergeCartLines, subtotalCents, MAX_QUANTITY_PER_ITEM } from '../api/_lib/cart.ts';
import { validUrl } from '../api/_lib/validate.ts';
import { sessionShippingDetails } from '../api/_lib/stripe.ts';
import { printfulOrderItem } from '../api/_lib/printful.ts';

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

test('duplicate variant lines are merged before the per-item ceiling applies', () => {
    const merged = mergeCartLines([
        { variantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 8 },
        { variantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 8 },
        { variantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', quantity: 2 },
    ]);
    assert.equal(merged.length, 2);
    assert.equal(
        merged.find(l => l.variantId.startsWith('aaaaaaaa'))?.quantity,
        MAX_QUANTITY_PER_ITEM,
        'two lines of 8 must clamp to 10, not charge 16',
    );
    assert.equal(merged.find(l => l.variantId.startsWith('bbbbbbbb'))?.quantity, 2);
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

test('validUrl rejects javascript: and other non-http schemes', () => {
    assert.equal(validUrl('https://instagram.com/tooiicy'), true);
    assert.equal(validUrl('http://example.com'), true);
    assert.equal(validUrl('javascript:alert(1)'), false);
    assert.equal(validUrl('data:text/html,hi'), false);
    assert.equal(validUrl('not a url'), false);
});

test('sessionShippingDetails prefers collected_information over legacy shipping_details', () => {
    const withCollected = {
        collected_information: {
            shipping_details: { name: 'New', address: { line1: '1 Main' } },
        },
        shipping_details: { name: 'Legacy', address: { line1: '2 Main' } },
    };
    assert.equal(sessionShippingDetails(/** @type {any} */ (withCollected))?.name, 'New');

    const legacyOnly = {
        shipping_details: { name: 'Legacy', address: { line1: '2 Main' } },
    };
    assert.equal(sessionShippingDetails(/** @type {any} */ (legacyOnly))?.name, 'Legacy');
});

test('printfulOrderItem defaults to sync variants for branded merch', () => {
    delete process.env.PRINTFUL_USE_CATALOG_VARIANTS;
    assert.deepEqual(printfulOrderItem(99, 2), { sync_variant_id: 99, quantity: 2 });
    process.env.PRINTFUL_USE_CATALOG_VARIANTS = 'true';
    assert.deepEqual(printfulOrderItem(99, 2), { variant_id: 99, quantity: 2 });
    delete process.env.PRINTFUL_USE_CATALOG_VARIANTS;
});
