/**
 * Pure logic tests — no network. Run with:
 *   node --experimental-strip-types --test tests/*.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeDomain,
    normalizeTimestamp,
    normalizeProjectId,
    slugifyProjectName,
    archiveSnapshotUrl,
    ValidationError,
} from '../api/_lib/domain.ts';

test('normalizeDomain strips scheme, path, www, and lowercases', () => {
    assert.equal(normalizeDomain('https://WWW.Example.com/path?x=1'), 'example.com');
    assert.equal(normalizeDomain('  example.com  '), 'example.com');
});

test('normalizeDomain rejects non-hostname input', () => {
    assert.throws(() => normalizeDomain('not a domain'), ValidationError);
    assert.throws(() => normalizeDomain(''), ValidationError);
    assert.throws(() => normalizeDomain(undefined), ValidationError);
    assert.throws(() => normalizeDomain('-example.com'), ValidationError);
});

test('normalizeDomain discards any path/query, keeping only the hostname', () => {
    // Deliberate: the caller can't smuggle a path/query into the archive.org
    // URL this value gets interpolated into, since only the hostname survives.
    assert.equal(normalizeDomain('example.com/../../etc/passwd'), 'example.com');
});

test('normalizeTimestamp defaults and validates', () => {
    assert.equal(normalizeTimestamp(undefined), '20210101000000');
    assert.equal(normalizeTimestamp('20220115000000'), '20220115000000');
    assert.throws(() => normalizeTimestamp('not-a-timestamp'), ValidationError);
    assert.throws(() => normalizeTimestamp('12; DROP TABLE'), ValidationError);
});

test('normalizeProjectId only allows lowercase/digits/hyphens', () => {
    assert.equal(normalizeProjectId('dareal-example-com'), 'dareal-example-com');
    assert.throws(() => normalizeProjectId('Not Valid!'), ValidationError);
});

test('slugifyProjectName produces a valid Vercel project name', () => {
    assert.equal(slugifyProjectName('Old-Hair_Salon.com'), 'dareal-old-hair-salon-com');
    assert.equal(slugifyProjectName('example.com'), 'dareal-example-com');
});

test('archiveSnapshotUrl builds the expected id_ passthrough URL', () => {
    assert.equal(
        archiveSnapshotUrl('example.com', '20210101000000'),
        'https://web.archive.org/web/20210101000000id_/https://example.com',
    );
});
