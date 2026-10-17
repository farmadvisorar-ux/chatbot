import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSnapshotHtml } from '../api/_lib/sanitize.ts';

test('strips the wayback toolbar and its comment markers', () => {
    const raw = `<html><body>
<!-- BEGIN WAYBACK TOOLBAR INSERT -->
<div id="wm-ipp-base">toolbar junk</div>
<!-- END WAYBACK TOOLBAR INSERT -->
<script src="https://archive.org/includes/analytics.js"></script>
<p>Real content</p>
</body></html>`;
    const { html } = sanitizeSnapshotHtml(raw);
    assert.ok(!html.includes('toolbar junk'));
    assert.ok(!html.includes('analytics.js'));
    assert.ok(html.includes('Real content'));
});

test('rewrites archived absolute asset URLs back to the original', () => {
    const raw = `<html><body>
<img src="https://web.archive.org/web/20210101000000im_/https://example.com/logo.png">
<link href="https://web.archive.org/web/20210101000000cs_/https://example.com/style.css" rel="stylesheet">
<a href="https://web.archive.org/web/20210101000000/https://example.com/about.html">About</a>
</body></html>`;
    const { html, rewrittenAssets } = sanitizeSnapshotHtml(raw);
    assert.ok(html.includes('src="https://example.com/logo.png"'));
    assert.ok(html.includes('href="https://example.com/style.css"'));
    assert.ok(html.includes('href="https://example.com/about.html"'));
    assert.equal(rewrittenAssets, 3);
});

test('neutralizes known spam link patterns without touching normal links', () => {
    const raw = `<html><body>
<a href="https://bit.ly/spam123">shortened</a>
<a href="https://example.com/contact">Contact</a>
</body></html>`;
    const { html, strippedLinks } = sanitizeSnapshotHtml(raw);
    assert.ok(!html.includes('bit.ly'));
    assert.ok(html.includes('href="https://example.com/contact"'));
    assert.equal(strippedLinks, 1);
});

test('the spam blocklist is substring-based, so it can catch legitimate URLs containing the word', () => {
    // Documents a known, accepted trade-off rather than hiding it: this is
    // a best-effort cleanup pass, not a precise classifier.
    const raw = `<a href="https://example.com/legit-casino-review">review</a>`;
    const { strippedLinks } = sanitizeSnapshotHtml(raw);
    assert.equal(strippedLinks, 1);
});
