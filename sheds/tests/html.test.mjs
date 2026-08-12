import { test } from 'node:test';
import assert from 'node:assert/strict';

import { esc, html, raw, join, safeUrl, jsonForScript } from '../src/lib/html.ts';

test('interpolation escapes by default', () => {
    // The whole point of the tagged template: forgetting to escape is not
    // possible, because escaping is what happens when you do nothing.
    const evil = '<script>alert(1)</script>';
    assert.equal(html`<p>${evil}</p>`.toString(), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('ordinary supplier copy survives intact', () => {
    // This is the case that actually occurs — the feed is full of quotes,
    // ampersands and feet marks, and mangling them would be a visible bug on
    // every page long before anything malicious showed up.
    assert.equal(esc(`6'6" walls & trusses`), '6&#39;6&quot; walls &amp; trusses');
});

test('raw markup passes through unescaped', () => {
    assert.equal(html`<div>${raw('<b>ours</b>')}</div>`.toString(), '<div><b>ours</b></div>');
});

test('nested templates are not double-escaped', () => {
    // A page is built from components built from components. If the result of
    // one html`` were escaped when interpolated into another, every layer
    // would show its own markup as text.
    const inner = html`<span>${'A & B'}</span>`;
    assert.equal(html`<p>${inner}</p>`.toString(), '<p><span>A &amp; B</span></p>');
});

test('arrays interpolate as children, not as a comma-joined string', () => {
    const items = [html`<li>1</li>`, html`<li>2</li>`];
    assert.equal(html`<ul>${items}</ul>`.toString(), '<ul><li>1</li><li>2</li></ul>');
});

test('strings inside an interpolated array are still escaped', () => {
    assert.equal(html`<ul>${['<b>', '&']}</ul>`.toString(), '<ul>&lt;b&gt;&amp;</ul>');
});

test('join escapes plain strings and trusts Raw', () => {
    assert.equal(join(['a & b', raw('<i>c</i>')], '|').toString(), 'a &amp; b|<i>c</i>');
});

test('only http(s) and site-relative URLs are allowed in an href', () => {
    assert.equal(safeUrl('https://cdn.shopify.com/x.jpg'), 'https://cdn.shopify.com/x.jpg');
    assert.equal(safeUrl('/b/10x16-workshop'), '/b/10x16-workshop');
    assert.equal(safeUrl('#quote'), '#quote');
    // The oldest trick there is, and the catalogue carries supplier-supplied
    // URLs, so it is a live path rather than a hypothetical one.
    assert.equal(safeUrl('javascript:alert(1)'), '#');
    assert.equal(safeUrl('JaVaScRiPt:alert(1)'), '#');
    assert.equal(safeUrl('data:text/html,<script>'), '#');
    assert.equal(safeUrl(''), '#');
    assert.equal(safeUrl(null), '#');
});

test('a protocol-relative URL is refused', () => {
    // "//evil.example" inherits the page's scheme and loads fine — it looks
    // site-relative to a careless check but is not.
    assert.equal(safeUrl('//evil.example/x.js'), '#');
});

test('a URL that would break out of its attribute is refused', () => {
    // safeUrl's result goes through raw() straight into src="…", so a URL
    // that passes the scheme check while carrying a quote closes the
    // attribute and everything after it becomes markup. The catalogue's image
    // URLs come from the supplier's feed, which makes this reachable rather
    // than hypothetical.
    assert.equal(safeUrl('https://cdn.example/x.jpg" onerror="alert(1)'), '#');
    assert.equal(safeUrl("https://cdn.example/x.jpg' onerror='alert(1)"), '#');
    assert.equal(safeUrl('https://cdn.example/x.jpg><script>alert(1)</script>'), '#');
    assert.equal(safeUrl('https://cdn.example/a b.jpg'), '#');
    // A properly encoded URL is unaffected — this must not reject real ones.
    assert.equal(
        safeUrl('https://cdn.shopify.com/s/files/a%20b.jpg?v=1&width=600'),
        'https://cdn.shopify.com/s/files/a%20b.jpg?v=1&width=600',
    );
});

test('JSON-LD cannot close its own script element', () => {
    // JSON.stringify escapes for JSON, not for HTML: it leaves "<" alone. The
    // building pages build JSON-LD out of supplier titles, so a title
    // containing </script> would end the element and run what followed.
    const out = jsonForScript({ name: '10x12 Shed</script><script>alert(1)</script>' }).toString();
    assert.ok(!out.includes('</script>'), 'the JSON-LD can close its own element');
    assert.ok(!out.includes('<'), 'a raw < survived into the script element');
    // Still valid JSON, and still the same string once parsed — escaping must
    // not corrupt the data it is protecting.
    assert.equal(JSON.parse(out).name, '10x12 Shed</script><script>alert(1)</script>');
});

test('JSON-LD escapes the line separators that break a script parser', () => {
    // Valid inside a JSON string, but line terminators to a JavaScript parser.
    const out = jsonForScript({ a: ' ', b: ' ' }).toString();
    assert.ok(!out.includes(' ') && !out.includes(' '));
    assert.equal(JSON.parse(out).a, ' ');
});
