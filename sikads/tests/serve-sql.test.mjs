import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const adsSource = readFileSync(join(here, '..', 'api', 'ads.ts'), 'utf8');

test('serve UPDATE refuses to oversell when views_remaining is already zero', () => {
    // The candidate CTE filters views_remaining > 0, but without the same
    // predicate on UPDATE two concurrent serves of the last view both succeed.
    assert.match(
        adsSource,
        /WHERE ad_campaigns\.id = candidate\.id\s+AND ad_campaigns\.views_remaining > 0/s,
        'serve UPDATE is missing the views_remaining > 0 guard',
    );
});

test('serve does not spend inventory for an inactive or unknown slot key', () => {
    assert.match(
        adsSource,
        /p\.slot_key = \$1 AND p\.status = 'active'/,
        'serve no longer requires an active publisher for non-empty slots',
    );
    assert.match(
        adsSource,
        /\$1 = ''/,
        'serve no longer allows first-party empty-slot serves',
    );
});

test('checkout locks to card payments and uses an idempotency key', () => {
    assert.match(adsSource, /payment_method_types:\s*\['card'\]/);
    assert.match(adsSource, /idempotencyKey:\s*`sikads-ad-\$\{adId\}`/);
});
