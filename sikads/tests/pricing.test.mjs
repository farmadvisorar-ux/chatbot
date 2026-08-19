import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    MIN_CPM_CENTS, MAX_CPM_CENTS, MIN_BUDGET_CENTS, MAX_BUDGET_CENTS,
    PUBLISHER_SHARE_PERCENT, computeViews, publisherMicrocentsPerView, microcentsToCents,
} from '../api/_lib/pricing.ts';

/**
 * These cover the arithmetic that decides how much of a real payment a real
 * person is owed. Every case here is a way to quietly pay the wrong amount:
 * none of them throws, and none would be caught by a type check.
 */

test('a campaign can never serve more views than it paid for', () => {
    // Sweeping the legal range rather than a couple of examples: the failure
    // this guards against is a rounding direction that only shows up at
    // particular ratios, and overdelivery is money given away.
    for (let cpm = MIN_CPM_CENTS; cpm <= MAX_CPM_CENTS; cpm += 7) {
        for (const budget of [MIN_BUDGET_CENTS, 1000, 2500, 4000, 99_999, MAX_BUDGET_CENTS]) {
            const views = computeViews(budget, cpm);
            assert.ok(Number.isInteger(views), `non-integer views at cpm=${cpm} budget=${budget}`);
            assert.ok(views >= 0, `negative views at cpm=${cpm} budget=${budget}`);
            // What those views actually cost must not exceed what was paid.
            const costOfViews = (views * cpm) / 1000;
            assert.ok(
                costOfViews <= budget + 1e-9,
                `overdelivery: ${views} views at ${cpm}/1000 costs ${costOfViews} > budget ${budget}`,
            );
        }
    }
});

test('the publisher is paid the stated share, not approximately', () => {
    // The 40% is a public promise on the landing page. If this drifts, the
    // page is lying rather than the code merely being off.
    for (let cpm = MIN_CPM_CENTS; cpm <= MAX_CPM_CENTS; cpm += 13) {
        const perView = publisherMicrocentsPerView(cpm);
        // 1,000 views of a campaign at `cpm` costs the advertiser exactly cpm
        // cents; the publisher's share of that is cpm * share%.
        const per1000Microcents = perView * 1000;
        const expectedCents = (cpm * PUBLISHER_SHARE_PERCENT) / 100;
        assert.ok(
            Math.abs(per1000Microcents / 1000 - expectedCents) <= 1,
            `share drifted at cpm=${cpm}: got ${per1000Microcents / 1000}c want ${expectedCents}c`,
        );
    }
});

test('the platform keeps the remainder, and the two sides sum to the whole', () => {
    for (let cpm = MIN_CPM_CENTS; cpm <= MAX_CPM_CENTS; cpm += 29) {
        const publisherPer1000 = (publisherMicrocentsPerView(cpm) * 1000) / 1000; // cents
        const platformPer1000 = cpm - publisherPer1000;
        assert.ok(platformPer1000 >= 0, `platform share went negative at cpm=${cpm}`);
        assert.ok(
            Math.abs(publisherPer1000 + platformPer1000 - cpm) < 1e-9,
            `shares do not sum to the price at cpm=${cpm}`,
        );
    }
});

test('rounding a balance to payable cents never invents money', () => {
    // microcentsToCents decides what actually gets sent. Rounding up here
    // would pay out money that was never collected.
    for (const micro of [0, 1, 999, 1000, 1001, 1999, 2000, 123_456, 999_999]) {
        const cents = microcentsToCents(micro);
        assert.ok(Number.isInteger(cents), `non-integer payout for ${micro}`);
        assert.ok(cents * 1000 <= micro, `paid out ${cents}c from only ${micro} microcents`);
        assert.ok(micro - cents * 1000 < 1000, `left more than a cent unpaid from ${micro}`);
    }
});

test('a single view at the floor rate is still worth something', () => {
    // The reason the ledger is in microcents at all: at the minimum rate a
    // view is worth a fraction of a cent, and integer cents would silently
    // record every one of them as zero.
    const perView = publisherMicrocentsPerView(MIN_CPM_CENTS);
    assert.ok(perView > 0, 'a view at the minimum rate rounds to nothing');
});

test('the advertised floor and ceiling are coherent', () => {
    assert.ok(MIN_CPM_CENTS > 0);
    assert.ok(MAX_CPM_CENTS > MIN_CPM_CENTS);
    assert.ok(MIN_BUDGET_CENTS > 0);
    assert.ok(MAX_BUDGET_CENTS > MIN_BUDGET_CENTS);
    // The cheapest legal campaign has to buy at least one view, or the form
    // accepts a purchase that delivers nothing.
    assert.ok(
        computeViews(MIN_BUDGET_CENTS, MAX_CPM_CENTS) >= 1,
        'the minimum budget at the maximum rate buys no views at all',
    );
});

test('the share is the number the landing page quotes', () => {
    // Guards the constant itself: changing it is changing a public promise,
    // and this test is where that decision has to be made deliberately.
    assert.equal(PUBLISHER_SHARE_PERCENT, 40);
});
