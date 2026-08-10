/**
 * Sikads publisher unit.
 *
 *   <div id="sikads"></div>
 *   <script src="https://sikads.com/embed.js" data-slot="sk_..."></script>
 *
 * Plain ES5-ish JS served as a static file rather than part of the app bundle:
 * this runs on other people's sites, so it must not assume a build step, a
 * framework, or module support, and it must never throw into their page.
 *
 * Deliberately small in scope — it renders one link and nothing else. No
 * cookies, no fingerprinting, no third-party calls beyond fetching the ad,
 * which is what makes it safe to hand to someone for their own site.
 */
(function () {
    'use strict';

    var script = document.currentScript;
    if (!script) return;

    var slot = script.getAttribute('data-slot');
    if (!slot) return;

    // Call back to wherever this script was served from, so a staging deploy
    // talks to staging rather than production.
    var origin = new URL(script.src, window.location.href).origin;
    var mount = document.getElementById(script.getAttribute('data-target') || 'sikads');
    if (!mount) return;

    var STYLE = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:12px 14px', 'border:1px solid rgba(128,128,128,.28)', 'border-radius:12px',
        'font:600 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'text-decoration:none', 'color:inherit',
    ].join(';');

    var TAG_STYLE = [
        'flex:0 0 auto', 'font-size:9px', 'font-weight:800', 'letter-spacing:.08em',
        'text-transform:uppercase', 'opacity:.6',
    ].join(';');

    function isHttpUrl(value) {
        if (!value || typeof value !== 'string') return false;
        try {
            var parsed = new URL(value);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (err) {
            return false;
        }
    }

    function render(ad) {
        // Refuse non-http(s) destinations even if the API somehow returned one —
        // assigning javascript: to href would execute on the publisher's origin.
        if (!ad || !isHttpUrl(ad.url) || typeof ad.headline !== 'string') return;

        // Built with DOM calls, not innerHTML: the headline is advertiser-supplied
        // text and this runs inside someone else's page, so it never becomes markup.
        var link = document.createElement('a');
        link.href = ad.url;
        link.target = '_blank';
        link.rel = 'noopener sponsored';
        link.setAttribute('style', STYLE);

        var tag = document.createElement('span');
        tag.setAttribute('style', TAG_STYLE);
        tag.textContent = 'Sponsored';

        var text = document.createElement('span');
        text.style.flex = '1';
        text.textContent = ad.headline;

        link.appendChild(tag);
        link.appendChild(text);

        mount.textContent = '';
        mount.appendChild(link);
    }

    fetch(origin + '/api/ads?slot=' + encodeURIComponent(slot))
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (payload) { if (payload && payload.ad) render(payload.ad); })
        .catch(function () {
            /* A network failure leaves the container exactly as the publisher
               left it. An ad that cannot load must never break their page. */
        });
})();
