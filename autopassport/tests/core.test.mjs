import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORIES, CERTIFICATION_FEE_CENTS, isCategory } from '../api/_lib/pricing.ts';
import { sslFor } from '../api/_lib/db.ts';
import { clean, validEmail, validHttpsUrl, validUrl } from '../api/_lib/validate.ts';
import { safeHref, safeImageSrc } from '../src/safe-url.ts';

test('the advertised certification price stays aligned with the business rule', async () => {
    assert.equal(CERTIFICATION_FEE_CENTS, 4_900);
    const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(page, /id="proof-fee">\$49</);
    assert.match(page, /id="fee-readout">\$49\.00</);
});

test('only the four public dashboard categories are accepted', () => {
    assert.deepEqual(CATEGORIES.map(category => category.value), [
        'navigation',
        'music',
        'phone_messaging',
        'other',
    ]);
    for (const category of CATEGORIES) assert.equal(isCategory(category.value), true);
    assert.equal(isCategory('video'), false);
    assert.equal(isCategory('navigation OR 1=1'), false);
});

test('submission fields are normalized and bounded', () => {
    assert.equal(clean('  Roadtrip Radio  ', 80), 'Roadtrip Radio');
    assert.equal(clean('abcdef', 3), 'abc');
    assert.equal(clean({ value: 'not a string' }), '');
    assert.equal(validEmail('driver@example.com'), true);
    assert.equal(validEmail('not-an-email'), false);
});

test('links accept web URLs while remote images require HTTPS', () => {
    assert.equal(validUrl('https://play.google.com/store/apps/details?id=example'), true);
    assert.equal(validUrl('http://example.test/app'), true);
    assert.equal(validUrl('javascript:alert(1)'), false);
    assert.equal(validHttpsUrl('https://cdn.example.test/icon.png'), true);
    assert.equal(validHttpsUrl('http://cdn.example.test/icon.png'), false);

    assert.equal(safeHref('https://example.test/app'), 'https://example.test/app');
    assert.equal(safeHref('mailto:attacker@example.test'), '#');
    assert.equal(safeHref('not a url'), '#');
    assert.equal(safeImageSrc('https://example.test/icon.png'), 'https://example.test/icon.png');
    assert.equal(safeImageSrc('http://example.test/icon.png'), '');
});

test('database TLS is disabled only for explicitly local connections', () => {
    assert.equal(sslFor('postgres://user:pass@localhost:5432/apps'), false);
    assert.equal(sslFor('postgres://user:pass@127.0.0.1/apps'), false);
    assert.deepEqual(
        sslFor('postgres://user:pass@db.example.test/apps'),
        { rejectUnauthorized: false },
    );
    assert.equal(sslFor('postgres://user:pass@db.example.test/apps?sslmode=disable'), false);
});

test('schema constrains app states and supports rate-limit cleanup', async () => {
    const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
    assert.match(schema, /CHECK \(status IN \('awaiting_payment', 'pending_review', 'certified', 'rejected'\)\)/);
    assert.match(schema, /rate_limit_events_cleanup ON rate_limit_events \(created_at\)/);
});

test('CSP-compatible pages do not rely on blocked inline event handlers', async () => {
    const [publicScript, adminScript] = await Promise.all([
        readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/admin.ts', import.meta.url), 'utf8'),
    ]);
    assert.doesNotMatch(publicScript, /\sonerror=/i);
    assert.doesNotMatch(adminScript, /\sonerror=/i);
});
