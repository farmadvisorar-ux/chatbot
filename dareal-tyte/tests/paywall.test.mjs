import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaywallBypassed, isAdminEmail } from '../api/_lib/paywall.ts';

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

test('isAdminEmail matches against a comma-separated, case-insensitive allowlist', () => {
    const original = process.env.ADMIN_EMAILS;
    try {
        process.env.ADMIN_EMAILS = 'farmadvisorar@gmail.com, other@example.com';
        assert.equal(isAdminEmail('farmadvisorar@gmail.com'), true);
        assert.equal(isAdminEmail('FarmAdvisorAR@Gmail.com'), true);
        assert.equal(isAdminEmail(' other@example.com '), true);
        assert.equal(isAdminEmail('random@example.com'), false);

        delete process.env.ADMIN_EMAILS;
        assert.equal(isAdminEmail('farmadvisorar@gmail.com'), false);
    } finally {
        if (original === undefined) delete process.env.ADMIN_EMAILS;
        else process.env.ADMIN_EMAILS = original;
    }
});
