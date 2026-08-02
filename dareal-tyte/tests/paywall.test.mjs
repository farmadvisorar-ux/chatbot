import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaywallBypassed } from '../api/_lib/paywall.ts';

test('isPaywallBypassed is false unless SKIP_PAYWALL is exactly "true"', () => {
    const original = process.env.SKIP_PAYWALL;
    try {
        delete process.env.SKIP_PAYWALL;
        assert.equal(isPaywallBypassed(), false);

        process.env.SKIP_PAYWALL = 'yes';
        assert.equal(isPaywallBypassed(), false);

        process.env.SKIP_PAYWALL = 'true';
        assert.equal(isPaywallBypassed(), true);
    } finally {
        if (original === undefined) delete process.env.SKIP_PAYWALL;
        else process.env.SKIP_PAYWALL = original;
    }
});
