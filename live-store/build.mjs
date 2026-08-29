import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

/**
 * The apex 308-redirects to www, so www is the canonical origin. Every
 * absolute URL below has to agree with that: a preview crawler that follows a
 * redirect to reach an image often just drops the image instead.
 */
const SITE = 'https://www.tooiicy.com';

const PRICE = '35.00';
const SIZES = ['S', 'M', 'L', 'XL', '2XL'];
const PRODUCT = 'I Hope The Worst Tee';
const BLURB =
    'Oversized boxy tee in washed black, with I HOPE THE WORST stacked across the chest. ' +
    'Dallas streetwear from Juicecuzz. Sizes S–2XL, $35.';

/**
 * Builds dist/index.html from the storefront page that is already in
 * production, applying the minimum set of patches needed to turn its
 * placeholder Checkout link into a real PayPal checkout.
 *
 * The page itself is not kept in this repo. It was hand-authored and deployed
 * directly to Vercel, and re-typing 35KB of it here by hand would be a
 * transcription risk with nothing to gain. Instead it is fetched from the
 * immutable per-deployment URL of the build that produced it, so this build is
 * reproducible and can never fetch its own output (which the mutable
 * tooiicy.com alias would start doing the moment this deploys there).
 *
 * Every patch below asserts that it actually matched. A silent no-op would
 * ship a Checkout button that still points at the homepage, which is the exact
 * bug this fixes, so a miss must fail the build rather than pass quietly.
 */
const SOURCE = 'https://tooiicy-k6iuz0qv7-wordwide-top-10.vercel.app/';

/** Applies one patch, failing the build if the pattern is no longer present. */
function patch(html, label, pattern, replacement) {
    if (!pattern.test(html)) {
        throw new Error(
            `Patch "${label}" did not match. The upstream page at ${SOURCE} has ` +
            `changed shape; re-check the patch before deploying.`,
        );
    }
    return html.replace(pattern, replacement);
}

const CHECKOUT_SCRIPT = `
<div id="tc-banner" role="status" aria-live="polite"></div>
<style>
#tc-banner{display:none;position:fixed;left:0;right:0;top:0;z-index:9999;padding:14px 18px;text-align:center;
font-family:'Space Mono',monospace;font-size:13px;letter-spacing:.06em;background:#2F86F0;color:#03121E;}
#tc-banner.on{display:block}
#tc-banner.err{background:#F0662F;color:#1E0A03}
</style>
<script>
(function(){
  var btn=document.getElementById("checkout");
  var banner=document.getElementById("tc-banner");

  function say(msg,isErr){
    banner.textContent=msg;
    banner.className=isErr?"on err":"on";
  }

  function post(url,body){
    return fetch(url,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    }).then(function(r){
      return r.json().catch(function(){return {};}).then(function(d){
        if(!r.ok) throw new Error(d.error||("Request failed ("+r.status+")"));
        return d;
      });
    });
  }

  // Checkout: hand the cart to the server, which prices it and opens a PayPal
  // order. The server never trusts a price from this page.
  btn.addEventListener("click",function(e){
    e.preventDefault();
    e.stopImmediatePropagation();
    if(btn.getAttribute("aria-disabled")==="true"){
      say("Your cart is empty.",true);
      return;
    }
    var items=(window.cart||[]).map(function(l){return {size:l.size,qty:l.qty};});
    if(!items.length){ say("Your cart is empty.",true); return; }
    btn.textContent="Redirecting to PayPal\\u2026";
    btn.setAttribute("aria-disabled","true");
    post("/api/checkout",{items:items}).then(function(d){
      window.location.href=d.url;
    }).catch(function(err){
      btn.textContent="Checkout";
      btn.setAttribute("aria-disabled","false");
      say(err.message||"Checkout failed. Please try again.",true);
    });
  },true);

  // PayPal sends the buyer back to "/?token=<paypal order id>" once they
  // approve. Capturing here is what actually takes the money.
  var token=new URLSearchParams(window.location.search).get("token");
  if(token){
    say("Confirming your payment\\u2026");
    post("/api/capture",{paypalOrderId:token}).then(function(d){
      say("Order confirmed. Thank you \\u2014 a PayPal receipt is on its way.");
      try{ window.history.replaceState({},"",window.location.pathname); }catch(e){}
      if(window.cart){ window.cart.length=0; if(window.render) window.render(); }
    }).catch(function(err){
      say(err.message||"We could not confirm that payment. Please contact us.",true);
    });
  }
})();
</script>
`;

const response = await fetch(SOURCE);
if (!response.ok) {
    throw new Error(`Could not fetch the storefront page: ${response.status} ${response.statusText}`);
}
let html = await response.text();

// Pre-orders are switched off until there is a way to collect the $15 balance.
// Both the option and the paragraph explaining it have to go, or the page
// promises a payment flow that no longer exists.
html = patch(
    html,
    'remove pre-order option',
    /\s*<button class="mode" data-m="pre"[\s\S]*?<\/button>/,
    '',
);
html = patch(
    html,
    'remove pre-order explainer',
    /\s*<div class="prenote" id="prenote">[\s\S]*?<\/div>/,
    '',
);
html = patch(
    html,
    'remove pre-order note toggle',
    /\s*el\("prenote"\)\.classList\.toggle\("on", mode==="pre"\);/,
    '',
);

// The page shipped og:image="/tee.jpg" — a relative URL. Facebook, iMessage,
// WhatsApp, Slack and Gmail all require an absolute one and silently drop a
// relative path, which is why shared links came through with no picture at
// all. Everything here is absolute and points at the canonical www origin.
//
// og:description also still sold the $20 pre-order, which no longer exists.
const SOCIAL_TAGS = `<meta property="og:type" content="product">
    <meta property="og:site_name" content="Tooiicy">
    <meta property="og:url" content="${SITE}/">
    <meta property="og:title" content="TOOIICY — ${PRODUCT}">
    <meta property="og:description" content="${BLURB}">
    <meta property="og:image" content="${SITE}/og-image.jpg">
    <meta property="og:image:secure_url" content="${SITE}/og-image.jpg">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Model wearing the Tooiicy ${PRODUCT} in washed black">
    <meta property="product:price:amount" content="${PRICE}">
    <meta property="product:price:currency" content="USD">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="TOOIICY — ${PRODUCT}">
    <meta name="twitter:description" content="${BLURB}">
    <meta name="twitter:image" content="${SITE}/og-image.jpg">
    <meta name="twitter:image:alt" content="Model wearing the Tooiicy ${PRODUCT} in washed black">
    <meta property="og:locale" content="en_US">
    <link rel="canonical" href="${SITE}/">
    <link rel="icon" href="${SITE}/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="${SITE}/favicon-96.png" sizes="96x96" type="image/png">
    <link rel="apple-touch-icon" href="${SITE}/apple-touch-icon.png">
    <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Product',
                '@id': `${SITE}/#product`,
                name: PRODUCT,
                description: BLURB,
                image: [`${SITE}/og-image.jpg`, `${SITE}/tee.jpg`],
                brand: { '@type': 'Brand', name: 'Tooiicy' },
                color: 'Washed Black',
                audience: { '@type': 'PeopleAudience', suggestedGender: 'unisex' },
                offers: SIZES.map(size => ({
                    '@type': 'Offer',
                    name: `${PRODUCT} — Size ${size}`,
                    url: `${SITE}/`,
                    priceCurrency: 'USD',
                    price: PRICE,
                    availability: 'https://schema.org/InStock',
                    itemCondition: 'https://schema.org/NewCondition',
                    seller: { '@id': `${SITE}/#brand` },
                })),
            },
            // Ties the store to its founder and its city, which is what a
            // search engine reads to treat Tooiicy as a brand entity rather
            // than an unattributed page that happens to sell a shirt.
            {
                '@type': 'Organization',
                '@id': `${SITE}/#brand`,
                name: 'Tooiicy',
                url: `${SITE}/`,
                logo: `${SITE}/favicon-96.png`,
                image: `${SITE}/og-image.jpg`,
                description: 'Streetwear label out of Dallas, Texas, founded by the artist Juicecuzz.',
                founder: { '@type': 'Person', name: 'Jimarri Wells', alternateName: 'Juicecuzz' },
                address: {
                    '@type': 'PostalAddress',
                    addressLocality: 'Dallas',
                    addressRegion: 'TX',
                    addressCountry: 'US',
                },
            },
            {
                '@type': 'WebSite',
                '@id': `${SITE}/#website`,
                url: `${SITE}/`,
                name: 'Tooiicy',
                publisher: { '@id': `${SITE}/#brand` },
                inLanguage: 'en-US',
            },
        ],
    })}</script>`;

html = patch(
    html,
    'replace social tags with absolute-URL versions',
    /<meta property="og:title"[\s\S]*?<meta property="og:image"[^>]*>/,
    SOCIAL_TAGS,
);

// The meta description sold the pre-order too.
html = patch(
    html,
    'drop pre-order copy from the meta description',
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${BLURB}">`,
);

// The product shot is a 340x353 JPEG, but .stage img stretched it to the full
// width of its grid column — around 570px on a desktop, so roughly 1.7x native
// and blurry. Holding it to its own resolution renders it sharp instead, and
// centring it in the stage keeps that from reading as a layout mistake.
//
// This is a stopgap, not a fix: the ceiling is the source file. Swap in a
// ~1200px original and this cap should be raised to match it.
html = patch(
    html,
    'stop upscaling the product shot',
    /\.stage img\{width:100%;height:auto;\}/,
    '.stage img{display:block;width:100%;max-width:340px;height:auto;margin:0 auto;}',
);

// The product shot is the largest thing above the fold, so it decides the
// page's LCP. Telling the browser to fetch it at high priority stops it
// queueing behind the webfont CSS.
html = patch(
    html,
    'prioritise the LCP image',
    /(<img src="\/tee\.jpg"[^>]*?)>/,
    '$1 fetchpriority="high" decoding="async">',
);

// The webfont stylesheet blocked the first render. Loading it as print media
// and flipping to all on load takes it off the critical path; the noscript
// copy keeps it working without JavaScript. The font URL already carries
// display=swap, so text was always going to swap in — this just stops the
// whole page waiting on Google's server first.
html = patch(
    html,
    'stop webfont CSS blocking the first render',
    /<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)" rel="stylesheet">/,
    '<link rel="preload" as="style" href="$1">\n' +
    '    <link rel="stylesheet" href="$1" media="print" onload="this.media=\'all\';this.onload=null">\n' +
    '    <noscript><link rel="stylesheet" href="$1"></noscript>',
);

// Cart thumbnails are below the fold and only exist once something is added,
// so they should never compete with the first paint. The empty alt also left
// the row unreadable to a screen reader.
html = patch(
    html,
    'defer and label the cart thumbnail',
    /<img class="lithumb" src="\/tee\.jpg" alt="">/,
    '<img class="lithumb" src="/tee.jpg" alt="Tooiicy I Hope The Worst tee in washed black" ' +
    'width="52" height="52" loading="lazy" decoding="async">',
);

// The bug itself: with items in the cart the page pointed Checkout at
// CHECKOUT_URL ("https://tooiicy.com"), which is this same homepage, so
// checking out just reopened the store.
html = patch(
    html,
    'stop Checkout linking to the homepage',
    /co\.setAttribute\("href",CHECKOUT_URL\);co\.setAttribute\("target","_blank"\);co\.setAttribute\("rel","noopener"\);/,
    'co.setAttribute("href","#");',
);

// render() is called by the confirmation handler to empty the cart on return.
html = patch(html, 'expose render()', /\nrender\(\);/, '\nwindow.render=render;\nrender();');

html = patch(html, 'inject checkout', /<\/body>/, `${CHECKOUT_SCRIPT}</body>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log(`built dist/index.html (${html.length} bytes)`);

/**
 * Copies across every local file the page asks for.
 *
 * This deployment replaces one that was uploaded whole, so anything the page
 * references but this build does not emit becomes a 404 the moment it ships —
 * which is exactly what happened to the product photo on the first release.
 * The list is scraped from the built HTML rather than hardcoded so a new
 * asset cannot be silently left behind, and a reference that will not fetch
 * fails the build instead of going live broken.
 */
const referenced = new Set(
    [...html.matchAll(/["'(](\/[A-Za-z0-9._~-]+\.[A-Za-z0-9]{2,5})["')]/g)].map(match => match[1]),
);

for (const path of referenced) {
    const assetResponse = await fetch(new URL(path, SOURCE));
    if (!assetResponse.ok) {
        throw new Error(
            `The page references ${path} but it could not be fetched from ` +
            `${SOURCE} (${assetResponse.status}). Shipping without it would 404.`,
        );
    }
    const bytes = Buffer.from(await assetResponse.arrayBuffer());
    await writeFile(`dist${path}`, bytes);
    console.log(`copied ${path} (${bytes.length} bytes)`);
}

if (referenced.size === 0) {
    throw new Error('No referenced assets found — the scrape pattern is probably broken.');
}

/**
 * Builds the 1200x630 share card that og:image points at.
 *
 * Composed here rather than committed so there is no binary to keep in step
 * with the photo. It is deliberately wordless: text would need fonts that the
 * build container is not guaranteed to have, and the title and price already
 * travel in the og: tags next to it.
 *
 * The source photo is only 340px wide, so it is placed at 470px tall — some
 * upscaling, but share cards are rendered small and the alternative is a
 * postage stamp adrift on a wide canvas.
 */
const CARD = { width: 1200, height: 630 };
const photo = await sharp(`dist${[...referenced].find(p => p.endsWith('tee.jpg')) ?? '/tee.jpg'}`)
    .resize({ height: 470, fit: 'inside' })
    .toBuffer();

await sharp({
    create: {
        width: CARD.width,
        height: CARD.height,
        channels: 3,
        // --panel from the site's own palette, so the card reads as the store.
        background: { r: 0x0B, g: 0x11, b: 0x1C },
    },
})
    .composite([{ input: photo, gravity: 'centre' }])
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile('dist/og-image.jpg');

const card = await sharp('dist/og-image.jpg').metadata();
if (card.width !== CARD.width || card.height !== CARD.height) {
    throw new Error(`Share card came out ${card.width}x${card.height}, expected 1200x630.`);
}
console.log(`built dist/og-image.jpg (${card.width}x${card.height})`);

/**
 * Favicons. There were none at all — every icon path 404'd and nothing was
 * declared — and Google puts a site's favicon next to its title in mobile
 * results, so the listing rendered with a blank placeholder.
 *
 * Drawn as rectangles rather than text so it does not depend on a font being
 * present wherever it gets rasterised. Google wants a square that is a
 * multiple of 48px, hence 96.
 */
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0B111C"/>
  <rect x="12" y="16" width="40" height="10" fill="#2F86F0"/>
  <rect x="27" y="16" width="10" height="32" fill="#2F86F0"/>
</svg>
`;
await writeFile('dist/favicon.svg', FAVICON_SVG);

for (const [file, size] of [['favicon-96.png', 96], ['apple-touch-icon.png', 180]]) {
    await sharp(Buffer.from(FAVICON_SVG)).resize(size, size).png().toFile(`dist/${file}`);
}
console.log('built favicon.svg, favicon-96.png, apple-touch-icon.png');

/**
 * IndexNow ownership key.
 *
 * Bing, Yandex, Seznam and Naver accept push notifications of changed URLs
 * with no account: proof of ownership is simply that this key is readable at
 * the domain root. Google is not a participant — it dropped its own
 * unauthenticated sitemap ping in 2023, so the only ways in are the Sitemap
 * line in robots.txt below and a signed-in Search Console submission.
 *
 * Hardcoded rather than generated per build: regenerating it would invalidate
 * the key already registered with those engines.
 */
const INDEXNOW_KEY = '17047c817511a705c8f53b39093340ed';
await writeFile(`dist/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);

await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

const today = new Date().toISOString().slice(0, 10);
await writeFile(
    'dist/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
    `</urlset>\n`,
);

/**
 * Google Merchant Center product feed, one entry per size.
 *
 * There are no GTINs for these, so each size carries an MPN and declares
 * identifier_exists=no, which is what Google expects from a brand selling its
 * own goods. Submitting this still needs a Merchant Center account with
 * shipping and returns configured — the feed alone does not list anything.
 */
const feedItems = SIZES.map(size => `    <item>
      <g:id>tooiicy-ihtw-${size.toLowerCase()}</g:id>
      <g:item_group_id>tooiicy-ihtw</g:item_group_id>
      <g:title>Tooiicy ${PRODUCT} — Washed Black, Size ${size}</g:title>
      <g:description>${BLURB}</g:description>
      <g:link>${SITE}/</g:link>
      <g:image_link>${SITE}/tee.jpg</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${PRICE} USD</g:price>
      <g:brand>Tooiicy</g:brand>
      <g:mpn>TOOIICY-IHTW-${size}</g:mpn>
      <g:identifier_exists>no</g:identifier_exists>
      <g:condition>new</g:condition>
      <g:age_group>adult</g:age_group>
      <g:gender>unisex</g:gender>
      <g:color>Washed Black</g:color>
      <g:size>${size}</g:size>
      <g:product_type>Apparel &amp; Accessories &gt; Clothing &gt; Shirts &amp; Tops</g:product_type>
      <g:google_product_category>212</g:google_product_category>
    </item>`).join('\n');

await writeFile(
    'dist/feed.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n    <title>Tooiicy</title>\n    <link>${SITE}/</link>\n` +
    `    <description>Dallas streetwear from Juicecuzz.</description>\n${feedItems}\n` +
    `  </channel>\n</rss>\n`,
);
/**
 * A plain catalog export, one row per size.
 *
 * Marketplace onboarding (Shop.com among them) generally starts by asking for
 * a spreadsheet of the catalog rather than a feed URL, and each one wants its
 * own column names. This is deliberately generic — standard retail fields,
 * no vendor's schema guessed at — so it can be remapped to whatever a given
 * marketplace's template turns out to require.
 */
const csvCell = value => `"${String(value).replace(/"/g, '""')}"`;
const CSV_COLUMNS = [
    'sku', 'item_group_id', 'title', 'description', 'brand', 'mpn',
    'price', 'currency', 'condition', 'availability', 'color', 'size',
    'gender', 'age_group', 'category', 'product_url', 'image_url',
];

const csvRows = SIZES.map(size => [
    `TOOIICY-IHTW-${size}`,
    'tooiicy-ihtw',
    `Tooiicy ${PRODUCT} — Washed Black, Size ${size}`,
    BLURB,
    'Tooiicy',
    `TOOIICY-IHTW-${size}`,
    PRICE,
    'USD',
    'New',
    'In stock',
    'Washed Black',
    size,
    'Unisex',
    'Adult',
    'Apparel & Accessories > Clothing > Shirts & Tops',
    `${SITE}/`,
    `${SITE}/tee.jpg`,
].map(csvCell).join(','));

await writeFile('dist/products.csv', `${CSV_COLUMNS.join(',')}\n${csvRows.join('\n')}\n`);

console.log(`built robots.txt, sitemap.xml, feed.xml, products.csv (${SIZES.length} variants)`);
