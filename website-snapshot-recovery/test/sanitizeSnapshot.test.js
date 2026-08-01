const test = require('node:test');
const assert = require('node:assert/strict');
const { rebuildSnapshot, stripWaybackPrefix, isSpamHref } = require('../src/lib/sanitizeSnapshot');

test('strips script tags entirely', () => {
  const out = rebuildSnapshot('<html><body><script>alert(1)</script><p>hi</p></body></html>');
  assert.ok(!out.includes('<script'));
  assert.ok(out.includes('hi'));
});

test('strips inline event handlers', () => {
  const out = rebuildSnapshot('<img src="a.png" onerror="alert(1)">');
  assert.ok(!/onerror/i.test(out));
});

test('blocks javascript: and data: hrefs', () => {
  const out = rebuildSnapshot('<a href="javascript:alert(1)">click</a><a href="data:text/html,x">x</a>');
  assert.ok(!out.includes('javascript:'));
  assert.ok(!out.includes('data:text/html'));
});

test('strips iframes, forms, and style blocks', () => {
  const out = rebuildSnapshot(
    '<iframe src="https://evil.example"></iframe><form action="https://evil.example"><input></form><style>body{background:url(x)}</style>'
  );
  assert.ok(!out.includes('<iframe'));
  assert.ok(!out.includes('<form'));
  assert.ok(!out.includes('<style'));
});

test('rewrites wayback-prefixed links back to the original URL', () => {
  assert.equal(
    stripWaybackPrefix('https://web.archive.org/web/20210101000000id_/http://example.com/about.html'),
    'http://example.com/about.html'
  );
});

test('flags known spam link hosts but not ordinary domains', () => {
  assert.equal(isSpamHref('http://bit.ly/xyz'), true);
  assert.equal(isSpamHref('http://examplehairsalon.com'), false);
});

test('removes the wayback toolbar injection while keeping page content', () => {
  const out = rebuildSnapshot('<div id="wm-ipp-base">toolbar</div><p>content</p>');
  assert.ok(!out.includes('wm-ipp-base'));
  assert.ok(out.includes('content'));
});
