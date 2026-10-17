import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStripe, siteOrigin, ACCESS_DURATION_MS } from '../api/_lib/stripe.ts';

test('getStripe returns null when STRIPE_SECRET_KEY is unset', () => {
    const original = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
        assert.equal(getStripe(), null);
    } finally {
        if (original !== undefined) process.env.STRIPE_SECRET_KEY = original;
    }
});

test('siteOrigin defaults to the production domain when unset', () => {
    const original = process.env.PUBLIC_SITE_URL;
    delete process.env.PUBLIC_SITE_URL;
    try {
        assert.equal(siteOrigin(), 'https://darealtyte.com');
    } finally {
        if (original !== undefined) process.env.PUBLIC_SITE_URL = original;
    }
});

test('ACCESS_DURATION_MS is approximately 6 months', () => {
    const sixMonthsMs = 1000 * 60 * 60 * 24 * 30 * 6;
    assert.equal(ACCESS_DURATION_MS, sixMonthsMs);
});
