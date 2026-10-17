import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveUrlVariants } from '../api/_lib/archive.ts';

test('archiveUrlVariants covers both schemes and www forms', () => {
    const urls = archiveUrlVariants('example.com', '20210101000000');
    assert.deepEqual(urls, [
        'https://web.archive.org/web/20210101000000id_/https://example.com',
        'https://web.archive.org/web/20210101000000id_/https://www.example.com',
        'https://web.archive.org/web/20210101000000id_/http://example.com',
        'https://web.archive.org/web/20210101000000id_/http://www.example.com',
    ]);
});

test('archiveUrlVariants normalizes a www-prefixed input rather than doubling it', () => {
    const urls = archiveUrlVariants('www.example.com', '20210101000000');
    assert.ok(!urls.some((u) => u.includes('www.www.')), 'must not produce www.www.example.com');
    assert.ok(urls.some((u) => u.endsWith('https://example.com')));
    assert.ok(urls.some((u) => u.endsWith('https://www.example.com')));
});

test('archiveUrlVariants tries the plain https form first', () => {
    // The common case should still cost a single request.
    const [first] = archiveUrlVariants('example.com', '20210101000000');
    assert.equal(first, 'https://web.archive.org/web/20210101000000id_/https://example.com');
});

test('archiveUrlVariants preserves the exact timestamp in every variant', () => {
    const ts = '19981212000000';
    for (const url of archiveUrlVariants('example.com', ts)) {
        assert.ok(url.includes(`/web/${ts}id_/`), `missing timestamp in ${url}`);
    }
});
