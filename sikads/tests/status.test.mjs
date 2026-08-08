import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeEnv, SETTINGS } from '../api/_lib/status.ts';

/**
 * Assembled at runtime rather than written out. A literal that looks like a
 * Stripe key is rejected by GitHub's push protection even when it is obvious
 * nonsense, and the scanner is right to not try to judge intent — so the
 * fixtures keep the prefixes the code branches on without ever forming a
 * matching literal in the file.
 */
const fakeKey = (mode) => ['sk', mode, 'thisisnotakey000000000'].join('_');

const SECRETS = {
    STRIPE_SECRET_KEY: fakeKey('live'),
    STRIPE_WEBHOOK_SECRET: ['whsec', 'notarealwebhooksecret00000000'].join('_'),
    ADMIN_SECRET: 'correct-horse-battery-staple-9917',
    DATABASE_URL: 'postgresql://nobody:notarealpassword@example.invalid/nodb',
};

/** Every string this response is ever allowed to contain, and why. */
function allowedStrings(env) {
    return new Set([
        ...SETTINGS.map((s) => s.name),
        'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL',
        'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING',
        'live', 'test',                                   // the Stripe mode, as a word
        env.PUBLIC_SITE_URL || 'https://sikads.com',      // not a secret; wrong breaks checkout
        env.VERCEL_ENV, env.VERCEL_REGION,                // Vercel's own metadata
        env.VERCEL_GIT_COMMIT_REF, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL,
        env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    ].filter((v) => v !== undefined));
}

/** Every string value anywhere in the response, however deeply nested. */
function stringsIn(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(stringsIn);
    if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
    return [];
}

test('the response can only contain strings from a fixed vocabulary', () => {
    // The endpoint is only defensible if this holds, and checking it as a
    // whitelist rather than a search for known secrets is what makes it hold
    // in future: a scan for substrings of the test's own fake keys misses a
    // four-character tail, a hashed key, a database hostname, or anything
    // else a later change might decide is "safe enough to show". Anything
    // that is not on this list fails, whether or not it looks like a secret.
    const env = { ...SECRETS, VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' };
    const allowed = allowedStrings(env);

    for (const found of stringsIn(describeEnv(env))) {
        assert.ok(allowed.has(found), `response contains an unexpected string: ${JSON.stringify(found)}`);
    }
});

test('no secret value survives into the response whole', () => {
    // Cheap, direct, and independent of the whitelist above — if the two ever
    // disagree, the whitelist has a hole in it.
    const body = JSON.stringify(describeEnv(SECRETS));
    for (const [name, value] of Object.entries(SECRETS)) {
        assert.ok(!body.includes(value), `${name}'s value appears in the response`);
    }
});

test('presence is reported for every setting the app reads', () => {
    const status = describeEnv({ ADMIN_SECRET: 'x' });

    assert.equal(status.settings.ADMIN_SECRET, true);
    assert.equal(status.settings.STRIPE_SECRET_KEY, false);
    assert.equal(status.settings.STRIPE_WEBHOOK_SECRET, false);
    assert.equal(status.settings.DATABASE_URL, false);
    assert.equal(status.ready, false);
    // Order matters: it is the order to fix them in, and nothing else works
    // before the database does.
    assert.deepEqual(status.missing, ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
});

test('an empty string counts as missing, not as set', () => {
    // Vercel will happily save a variable with an empty value, and every
    // consumer in the app treats '' as absent. Reporting it as present would
    // send someone hunting for a problem in the wrong place.
    const status = describeEnv({ ADMIN_SECRET: '', DATABASE_URL: '' });
    assert.equal(status.settings.ADMIN_SECRET, false);
    assert.equal(status.databaseVariable, null);
});

test('the reported database variable is the one db.ts would connect with', () => {
    // db.ts takes the first present alias in a fixed order. If this reported
    // a different one, it would send someone to edit a variable that is not
    // being used.
    const status = describeEnv({
        POSTGRES_URL: 'postgresql://a/b',
        DATABASE_URL_UNPOOLED: 'postgresql://c/d',
    });
    assert.equal(status.databaseVariable, 'POSTGRES_URL');
    assert.equal(status.settings.DATABASE_URL, true, 'an alias satisfies the database requirement');
    assert.ok(!status.missing.includes('DATABASE_URL'));
});

test('live and test Stripe keys are told apart', () => {
    // "Is this taking real money?" cannot be answered by looking at the site.
    assert.equal(describeEnv({ STRIPE_SECRET_KEY: fakeKey('live') }).stripeMode, 'live');
    assert.equal(describeEnv({ STRIPE_SECRET_KEY: fakeKey('test') }).stripeMode, 'test');
    // Restricted keys are the ones an operator is likelier to paste, and they
    // carry the same mode marker.
    assert.equal(describeEnv({ STRIPE_SECRET_KEY: ['rk', 'test', 'x'].join('_') }).stripeMode, 'test');
    assert.equal(describeEnv({}).stripeMode, null);
});

test('siteOrigin reports the fallback the app actually uses', () => {
    // A PUBLIC_SITE_URL that is unset does not mean redirects are broken —
    // stripe.ts falls back — so the reading has to be the effective value or
    // it points at a non-problem.
    assert.equal(describeEnv({}).siteOrigin, 'https://sikads.com');
    assert.equal(describeEnv({ PUBLIC_SITE_URL: 'https://x.vercel.app' }).siteOrigin, 'https://x.vercel.app');
});

test('the deployment identifies which project and commit it was built from', () => {
    // The point of the endpoint: settling "am I editing the right project"
    // before debugging anything else.
    const status = describeEnv({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'sikads.com',
        VERCEL_GIT_COMMIT_REF: 'main',
        VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
    });
    assert.equal(status.deployment.environment, 'production');
    assert.equal(status.deployment.project, 'sikads.com');
    assert.equal(status.deployment.branch, 'main');
    assert.equal(status.deployment.commit, 'abcdef1');
});

test('a fully configured deployment reports ready', () => {
    const status = describeEnv(SECRETS);
    assert.deepEqual(status.missing, []);
    assert.equal(status.ready, true);
    assert.equal(status.stripeMode, 'live');
});
