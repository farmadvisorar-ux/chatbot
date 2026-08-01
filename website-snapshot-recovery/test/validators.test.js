const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDomain, normalizeDomain, isValidTimestamp } = require('../src/lib/validators');

test('accepts a plain domain', () => {
  assert.equal(isValidDomain('examplehairsalon.com'), true);
});

test('accepts a domain with scheme, path, and query', () => {
  assert.equal(isValidDomain('https://examplehairsalon.com/about?x=1'), true);
});

test('rejects private, loopback, and link-local hosts', () => {
  assert.equal(isValidDomain('localhost'), false);
  assert.equal(isValidDomain('127.0.0.1'), false);
  assert.equal(isValidDomain('169.254.169.254'), false);
  assert.equal(isValidDomain('10.0.0.5'), false);
  assert.equal(isValidDomain('192.168.1.1'), false);
});

test('rejects garbage or empty input', () => {
  assert.equal(isValidDomain(''), false);
  assert.equal(isValidDomain(null), false);
  assert.equal(isValidDomain(undefined), false);
  assert.equal(isValidDomain('not a domain'), false);
  assert.equal(isValidDomain(42), false);
});

test('normalizeDomain strips scheme, path, query, and port', () => {
  assert.equal(normalizeDomain('https://Example.com:8080/path?x=1#frag'), 'example.com');
});

test('isValidTimestamp requires exactly 14 digits', () => {
  assert.equal(isValidTimestamp('20210101000000'), true);
  assert.equal(isValidTimestamp('2021010100'), false);
  assert.equal(isValidTimestamp('abcdefghijklmn'), false);
  assert.equal(isValidTimestamp(20210101000000), false);
});
