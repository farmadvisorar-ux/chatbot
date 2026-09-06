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
 * Answers copied verbatim from the page's own spec and about sections — an
 * assistant repeats these as fact, so nothing here may be invented. Shipping
 * cost is omitted on purpose: the page and the checkout disagree about it.
 */
const FAQ = [
    ['What sizes does the Tooiicy I Hope The Worst Tee come in?',
        'S through 2XL. The cut is oversized and boxy, so size down for a regular fit.'],
    ['How much is the I Hope The Worst Tee?',
        'It is $35.00 USD.'],
    ['What does the I Hope The Worst Tee look like?',
        'Washed black, oversized boxy cut with a drop shoulder and a ribbed knit crew collar. ' +
        'I HOPE THE WORST is printed stacked across the chest, with the Tooiicy skull set into the last word.'],
    ['How do I wash the I Hope The Worst Tee?',
        'Cold wash inside out, tumble dry low, no bleach.'],
    ['Where does Tooiicy ship from?',
        'Dallas, Texas. The clothes are designed and shipped out of Dallas.'],
    ['How do I pay for a Tooiicy order?',
        'Checkout goes through PayPal.'],
    ['Who is behind Tooiicy?',
        'Jimarri Wells, a Dallas artist who records as Juicecuzz. The brand takes its name from ' +
        'his 2022 album tooiicy summer.'],
];

/**
 * The live page is not in this repo, so it is fetched and patched. Pinned to
 * the immutable per-deployment URL, never the apex, so the build cannot fetch
 * its own output. See README for the full reasoning.
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
    var sid=null; try{ sid=sessionStorage.getItem("tooiicy_sid"); }catch(e){}
    post("/api/capture",{paypalOrderId:token,sessionId:sid}).then(function(d){
      var msg="Order confirmed. Thank you \\u2014 a PayPal receipt is on its way.";
      if(d.edition){
        msg+=" You got Card 0"+d.edition.card+" \\u2014 First Edition #"+
          String(d.edition.number).padStart(3,"0")+" of "+d.edition.limit+". "+
          "View your certificate: "+location.origin+"/certificate.html?token="+d.edition.token;
      }
      say(msg);
      try{ window.history.replaceState({},"",window.location.pathname); }catch(e){}
      if(window.cart){ window.cart.length=0; if(window.render) window.render(); }
    }).catch(function(err){
      say(err.message||"We could not confirm that payment. Please contact us.",true);
    });
  }
})();
</script>
`;

/**
 * Visitor tracking. The collector is a separate project, so analytics can
 * never take the shop down. text/plain keeps the beacon a "simple" CORS
 * request (no preflight). No cookie, no identifier outliving the tab.
 */
const TRACK_URL = 'https://tooiicy-analytics-wordwide-top-10.vercel.app/api/track';

const ANALYTICS_SCRIPT = `
<script>
(function(){
  var K="tooiicy_sid", sid;
  try{
    sid=sessionStorage.getItem(K);
    if(!sid){sid=Math.random().toString(36).slice(2)+Date.now().toString(36);sessionStorage.setItem(K,sid);}
  }catch(e){ sid=Math.random().toString(36).slice(2); }

  var q=new URLSearchParams(location.search);
  function send(event,props){
    try{
      fetch("${TRACK_URL}",{method:"POST",keepalive:true,mode:"cors",
        headers:{"Content-Type":"text/plain"},
        body:JSON.stringify({
          event:event, sessionId:sid, path:location.pathname,
          referrer:document.referrer||null,
          utmSource:q.get("utm_source"), utmMedium:q.get("utm_medium"),
          utmCampaign:q.get("utm_campaign"),
          screenW:window.innerWidth, props:props||null
        })}).catch(function(){});
    }catch(e){}
  }

  send("page_view");
  window.tooiicyTrack=send;

  function on(sel,fn){
    document.querySelectorAll(sel).forEach(function(el){el.addEventListener("click",fn)});
  }
  on(".size",function(){ send("select_size",{size:this.dataset.s}); });
  on("#cartBtn",function(){ send("open_cart"); });
  on("#add",function(){
    var s=document.querySelector('.size[aria-pressed="true"]');
    var qv=document.getElementById("qv");
    if(s) send("add_to_cart",{size:s.dataset.s, qty:Number(qv&&qv.textContent)||1});
  });
  on("#checkout",function(){
    if(this.getAttribute("aria-disabled")==="true") return;
    var items=(window.cart||[]);
    send("begin_checkout",{
      lines:items.length,
      qty:items.reduce(function(t,l){return t+l.qty},0)
    });
  });
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

// og:image was "/tee.jpg" — relative, which every preview crawler silently
// drops. All absolute now, pointing at the canonical www origin.
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
            // Founder and city: what makes Tooiicy read as a brand entity.
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
            // Not chasing a Google snippet (those are gone for commercial
            // sites) — this is machine-readable Q&A for engines that
            // summarise rather than rank.
            {
                '@type': 'FAQPage',
                '@id': `${SITE}/#faq`,
                mainEntity: FAQ.map(([question, answer]) => ({
                    '@type': 'Question',
                    name: question,
                    acceptedAnswer: { '@type': 'Answer', text: answer },
                })),
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

// The 340px shot was stretched to ~570px and looked soft. Capping it at its
// own resolution renders it sharp. A stopgap: the ceiling is the source file.
html = patch(
    html,
    'stop upscaling the product shot',
    /\.stage img\{width:100%;height:auto;\}/,
    '.stage img{display:block;width:100%;max-width:340px;height:auto;margin:0 auto;}',
);

// The LCP element: fetch it before the webfont CSS, not after.
html = patch(
    html,
    'prioritise the LCP image',
    /(<img src="\/tee\.jpg"[^>]*?)>/,
    '$1 fetchpriority="high" decoding="async">',
);

// Takes the webfont stylesheet off the critical path. The URL already has
// display=swap, so text was always going to swap; this stops the page
// waiting on Google's server to paint at all.
html = patch(
    html,
    'stop webfont CSS blocking the first render',
    /<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]*)" rel="stylesheet">/,
    '<link rel="preload" as="style" href="$1">\n' +
    '    <link rel="stylesheet" href="$1" media="print" onload="this.media=\'all\';this.onload=null">\n' +
    '    <noscript><link rel="stylesheet" href="$1"></noscript>',
);

// Below the fold, and the empty alt left the row unreadable aloud.
html = patch(
    html,
    'defer and label the cart thumbnail',
    /<img class="lithumb" src="\/tee\.jpg" alt="">/,
    '<img class="lithumb" src="/tee.jpg" alt="Tooiicy I Hope The Worst tee in washed black" ' +
    'width="52" height="52" loading="lazy" decoding="async">',
);

// The original bug: Checkout pointed at CHECKOUT_URL, the homepage itself.
html = patch(
    html,
    'stop Checkout linking to the homepage',
    /co\.setAttribute\("href",CHECKOUT_URL\);co\.setAttribute\("target","_blank"\);co\.setAttribute\("rel","noopener"\);/,
    'co.setAttribute("href","#");',
);

// render() is called by the confirmation handler to empty the cart on return.
html = patch(html, 'expose render()', /\nrender\(\);/, '\nwindow.render=render;\nrender();');

// Adds a Legal column to the existing footer grid, matching the Shop/Listen/
// Get-the-next-drop-first columns already there. Anchored on the contact
// mailto link — the last thing in the last existing column — rather than on
// exact whitespace, so small formatting changes upstream don't break it.
const LEGAL_FCOL = `
      <div class="fcol">
        <h4>Info</h4>
        <a href="/faq.html">FAQ</a>
        <a href="/privacy.html">Privacy Policy</a>
        <a href="/terms.html">Terms of Service</a>
      </div>`;

html = patch(
    html,
    'add Legal column to footer',
    /(<a href="mailto:Contact@tooiicy\.com"[^>]*>Contact@tooiicy\.com<\/a><\/p>\s*)<\/div>(\s*<\/div>\s*<div class="fbot">)/,
    `$1</div>${LEGAL_FCOL}$2`,
);

// "As seen on" style directory badge, sitting as its own row between the
// footer columns and the copyright line.
const PEERPUSH_BADGE = `
    <div class="fbadge" style="text-align:center;padding:20px 0;">
      <a href="https://peerpush.com/p/tooiicy-i-hope-the-worst-tea-shirt" target="_blank" rel="noopener">
        <img src="https://peerpush.com/p/tooiicy-i-hope-the-worst-tea-shirt/badge.png"
          alt="TOOIICY - I Hope the worst Tea-Shirt on PeerPush" width="230" height="54" loading="lazy"
          style="width:230px;height:auto;">
      </a>
    </div>`;

html = patch(
    html,
    'add PeerPush badge above footer copyright',
    /<div class="fbot">/,
    `${PEERPUSH_BADGE}\n    <div class="fbot">`,
);

// Product Hunt's own embed card, verbatim from their embed generator (inline
// styles only, so it renders the same regardless of the site's own CSS).
const PRODUCTHUNT_CARD = `
    <div style="display:flex;justify-content:center;padding:0 0 20px;">
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; border: 1px solid rgb(224, 224, 224); border-radius: 12px; padding: 20px; max-width: 500px; background: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.05) 0px 2px 8px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <img alt="Tooiicy" src="https://ph-files.imgix.net/cd222957-a40e-459c-831d-2a2d18278cb0.png?auto=compress,format&amp;codec=mozjpeg&amp;cs=strip&amp;fit=crop&amp;h=80&amp;w=80" style="width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex-shrink: 0;">
          <div style="flex: 1 1 0%; min-width: 0px;">
            <h3 style="margin: 0px; font-size: 18px; font-weight: 600; color: rgb(26, 26, 26); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Tooiicy</h3>
            <p style="margin: 4px 0px 0px; font-size: 14px; color: rgb(102, 102, 102); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">Authentic Dallas streetwear: The washed black boxy tee</p>
          </div>
        </div>
        <a href="https://www.producthunt.com/products/tooiicy?embed=true&amp;utm_source=embed&amp;utm_medium=post_embed" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; padding: 8px 16px; background: rgb(255, 97, 84); color: rgb(255, 255, 255); text-decoration: none; border-radius: 9999px; font-size: 16px; font-weight: 600; line-height: 1.5;">Check it out on Product Hunt &rarr;</a>
      </div>
    </div>`;

html = patch(
    html,
    'add Product Hunt embed card above footer copyright',
    /<div class="fbot">/,
    `${PRODUCTHUNT_CARD}\n    <div class="fbot">`,
);

const AGENT_WIDGET = `
<script>
  window.TOOIICY_AGENT_URL='https://tooiicy-agent-wordwide-top-10.vercel.app';
</script>
<script src="https://tooiicy-agent-wordwide-top-10.vercel.app/agent-widget.js"><\/script>
`;

html = patch(html, 'inject checkout', /<\/body>/, `${CHECKOUT_SCRIPT}${ANALYTICS_SCRIPT}${AGENT_WIDGET}</body>`);

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log(`built dist/index.html (${html.length} bytes)`);

/**
 * Copies every local file the page references. Scraped from the built HTML,
 * not hardcoded, so nothing can be left behind the way the product photo was
 * on the first release. A reference that will not fetch fails the build.
 */
// Pages this build writes itself, not assets to pull from SOURCE — the
// scrape below would otherwise try to fetch them from the upstream page and
// 404, since they only exist here.
const GENERATED_PAGES = new Set(['/certificate.html', '/faq.html', '/privacy.html', '/terms.html']);

const referenced = new Set(
    [...html.matchAll(/["'(](\/[A-Za-z0-9._~-]+\.[A-Za-z0-9]{2,5})["')]/g)]
        .map(match => match[1])
        .filter(path => !GENERATED_PAGES.has(path)),
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
 * The 1200x630 share card. Composed here so no binary has to stay in step
 * with the photo, and wordless because text would need fonts the build
 * container does not guarantee.
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
 * Favicons — there were none, so Google's mobile results showed a blank.
 * Rectangles rather than text, so no font dependency. Google wants a
 * multiple of 48px square, hence 96.
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
 * IndexNow ownership key — Bing, Yandex, Seznam and Naver take pushed URLs
 * with no account, proved by this file being readable at the root. Google
 * does not participate. Hardcoded: regenerating invalidates the registration.
 */
const INDEXNOW_KEY = '17047c817511a705c8f53b39093340ed';
await writeFile(`dist/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);

/**
 * Assistant crawlers named explicitly. "*" already allowed them, so this
 * changes no behaviour — it records the decision, so tightening "*" later
 * cannot cut them off by accident. Retrieval bots and training crawlers are
 * grouped apart because those are different bargains.
 */
const ASSISTANT_CRAWLERS = [
    'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
    'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended',
    'Bingbot', 'GPTBot', 'CCBot', 'Amazonbot', 'meta-externalagent',
];

await writeFile(
    'dist/robots.txt',
    `User-agent: *\nAllow: /\n\n` +
    ASSISTANT_CRAWLERS.map(bot => `User-agent: ${bot}\nAllow: /\n`).join('\n') +
    `\nSitemap: ${SITE}/sitemap.xml\n`,
);


/**
 * llms.txt per llmstxt.org — a proposal with partial adoption, not a standard.
 * Repeats facts already in the JSON-LD, so nothing depends on it being read.
 */
await writeFile('dist/llms.txt', `# Tooiicy

> Streetwear label out of Dallas, Texas, founded by the artist Jimarri Wells,
> who records as Juicecuzz. One product is currently for sale: the I Hope The
> Worst Tee, $35.00 USD.

## Product: ${PRODUCT}

- Price: $${PRICE} USD
- Colorway: washed black
- Cut: oversized, boxy, drop shoulder — size down for a regular fit
- Collar: ribbed knit crew
- Graphic: I HOPE THE WORST, stacked chest print, with the Tooiicy skull set
  into the last word
- Sizes: ${SIZES.join(', ')}
- Care: cold wash inside out, tumble dry low, no bleach
- Ships from: Dallas, Texas
- Payment: PayPal

## About the brand

Tooiicy came out of the music rather than the other way around. The 2022 album
tooiicy summer gave the brand its name. Jimarri Wells has released records
independently since 2021.

## Links

- Storefront: ${SITE}/
- Product feed (Google Merchant Center format): ${SITE}/feed.xml
- Catalog export (CSV): ${SITE}/products.csv
- Sitemap: ${SITE}/sitemap.xml

## Notes

- The name is spelled Tooiicy, with two i's.
- ${PRODUCT} is named after Juicecuzz's record I Hope The Worst.
`);
console.log('built llms.txt');

/**
 * The certificate a First Edition buyer lands on. Static shell, dynamic data:
 * it fetches its own card from /api/certificate by the token in the URL, so
 * this file never needs rebuilding as new orders claim new numbers. Colors
 * and font match the storefront's own banner (CHECKOUT_SCRIPT above) rather
 * than inventing a second palette.
 */
await writeFile('dist/certificate.html', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Tooiicy First Edition Certificate</title>
<style>
  :root{color-scheme:dark;}
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:#03121E;font-family:'Space Mono',monospace;color:#fff;}
  .card{max-width:420px;width:100%;background:#0B111C;border:2px solid #2F86F0;border-radius:10px;
    padding:32px;text-align:center;box-shadow:0 10px 40px rgba(47,134,240,.25);}
  .series{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7fb0ec;margin-bottom:6px;}
  .brand{font-size:26px;font-weight:700;letter-spacing:.06em;margin-bottom:18px;}
  .num{display:inline-block;background:#2F86F0;color:#03121E;font-weight:700;font-size:22px;
    padding:10px 20px;border-radius:6px;letter-spacing:.04em;margin-bottom:8px;}
  .rarity{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#F0662F;margin-bottom:22px;}
  .rows{text-align:left;border-top:1px solid rgba(47,134,240,.3);padding-top:16px;}
  .row{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;
    border-bottom:1px solid rgba(47,134,240,.15);}
  .row span:first-child{color:#7fb0ec;}
  .note{margin-top:22px;font-size:11px;line-height:1.6;color:#7fb0ec;border-top:1px solid rgba(47,134,240,.3);
    padding-top:16px;}
  .state{padding:40px 0;color:#7fb0ec;font-size:13px;}
  .err{color:#F0662F;}
  @media print{body{background:#fff;color:#000;}.card{border-color:#000;box-shadow:none;}}
</style>
</head>
<body>
<div class="card"><div id="c" class="state">Loading your certificate\\u2026</div></div>
<script>
(function(){
  var token=new URLSearchParams(location.search).get("token");
  var el=document.getElementById("c");
  if(!token){ el.className="state err"; el.textContent="Missing certificate link."; return; }
  fetch("/api/certificate?token="+encodeURIComponent(token))
    .then(function(r){ return r.json().then(function(d){ if(!r.ok) throw new Error(d.error||"Not found"); return d; }); })
    .then(function(d){
      el.outerHTML=
        '<div class="series">Tooiicy Collectible Series \\u00b7 Card 0'+d.card+'</div>'+
        '<div class="brand">'+d.product+'</div>'+
        '<div class="num">FIRST EDITION #'+String(d.edition).padStart(3,"0")+' / '+d.limit+'</div>'+
        '<div class="rarity">'+d.rarity+'</div>'+
        '<div class="rows">'+
          '<div class="row"><span>Card</span><span>0'+d.card+' of an ongoing series</span></div>'+
          '<div class="row"><span>Edition</span><span>'+d.edition+' of '+d.limit+' ever issued</span></div>'+
          '<div class="row"><span>Issued</span><span>'+new Date(d.issued).toLocaleDateString()+'</span></div>'+
        '</div>'+
        '<div class="note">Only the first '+d.limit+' '+d.product+' orders carry a First Edition number. '+
        'Every future Tooiicy drop adds another numbered card to the series \\u2014 this one doesn\\u2019t '+
        'get reissued once it sells out.</div>';
    })
    .catch(function(err){ el.className="state err"; el.textContent=err.message||"Certificate not found."; });
})();
</script>
</body>
</html>
`);
console.log('built certificate.html');

/**
 * Shared shell for the plain content pages below. Same palette and font as
 * the rest of the site (see CHECKOUT_SCRIPT and the certificate page above)
 * so a visitor following a footer link doesn't land somewhere that looks
 * like a different site.
 */
function legalPage(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${title} for Tooiicy, a Dallas streetwear label.">
<link rel="canonical" href="${SITE}/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${title} — Tooiicy</title>
<style>
  :root{color-scheme:dark;}
  *{box-sizing:border-box;}
  body{margin:0;background:#03121E;color:#E9F2F8;font-family:'Space Mono',monospace;line-height:1.7;}
  .wrap{max-width:720px;margin:0 auto;padding:48px 24px 80px;}
  a{color:#2F86F0;}
  .back{display:inline-block;margin-bottom:28px;font-size:13px;color:#7fb0ec;text-decoration:none;}
  .back:hover{text-decoration:underline;}
  h1{font-size:28px;letter-spacing:-.01em;margin:0 0 8px;color:#fff;}
  .updated{font-size:12px;color:#7fb0ec;margin:0 0 36px;text-transform:uppercase;letter-spacing:.08em;}
  h2{font-size:16px;color:#fff;margin:32px 0 10px;}
  p,li{font-size:14px;color:#cfe0ee;}
  ul{padding-left:20px;}
  .qa{margin-bottom:22px;}
  .qa dt{font-size:15px;font-weight:700;color:#fff;margin-bottom:6px;}
  .qa dd{margin:0;font-size:14px;color:#cfe0ee;}
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/">&larr; Back to Tooiicy</a>
  <h1>${title}</h1>
  <p class="updated">Last updated ${new Date().toISOString().slice(0, 10)}</p>
  ${bodyHtml}
</div>
</body>
</html>
`;
}

const FAQ_BODY = `<dl>
${FAQ.map(([q, a]) => `  <div class="qa"><dt>${q}</dt><dd>${a}</dd></div>`).join('\n')}
</dl>
<h2>Contact</h2>
<p>Anything not covered here: <a href="mailto:Contact@tooiicy.com">Contact@tooiicy.com</a></p>`;

await writeFile('dist/faq.html', legalPage('FAQ', FAQ_BODY));
console.log('built faq.html');

const PRIVACY_BODY = `
<p>Tooiicy ("we", "us") is a streetwear label operated out of Dallas, Texas.
This page explains what happens to your information when you visit this site
or place an order.</p>

<h2>Payment and order information</h2>
<p>Checkout is handled entirely by PayPal. When you pay, PayPal collects your
name, shipping address, and payment details directly — this site never sees
or stores your card number, and does not keep a copy of your name, email, or
shipping address in its own systems. Your order and shipping details live in
your PayPal account and are used by us only to fulfil that order.</p>

<h2>Analytics</h2>
<p>We use a small, self-hosted analytics system to see how many people visit
the site and which pages they look at. It does not use cookies and does not
track you across visits or across other websites. It works by hashing your IP
address together with the current date, so the resulting identifier changes
every day and cannot be used to build a profile of you over time or identify
you personally. We record coarse details like country, city, device type, and
which page you were on — never your name, email, or exact location.</p>

<h2>What we don't do</h2>
<ul>
  <li>We don't sell or share your data with advertisers.</li>
  <li>We don't use tracking cookies or cross-site pixels.</li>
  <li>We don't build advertising profiles.</li>
</ul>

<h2>First Edition certificates</h2>
<p>If your order is one of the first 200, we store a randomly generated
certificate number and a link token so you can look up your card online.
That record is not tied to your name or contact details — only to the order
itself.</p>

<h2>Contact</h2>
<p>Questions about this policy: <a href="mailto:Contact@tooiicy.com">Contact@tooiicy.com</a></p>`;

await writeFile('dist/privacy.html', legalPage('Privacy Policy', PRIVACY_BODY));
console.log('built privacy.html');

const TERMS_BODY = `
<p>By placing an order on tooiicy.com you agree to the following terms.</p>

<h2>Products and pricing</h2>
<p>We currently sell one product, the ${PRODUCT}, in sizes ${SIZES.join(', ')}, at
$${PRICE} USD per item. Prices are set and verified on our server at the time
of checkout — nothing you see or edit in your browser can change what you're
charged.</p>

<h2>Payment</h2>
<p>Payment is processed by PayPal. We do not accept any other payment method,
and we never see or store your full payment details.</p>

<h2>First Edition cards</h2>
<p>The first 200 orders of the ${PRODUCT} are issued a numbered First Edition
certificate as a collectible bonus. It has no cash value, is not an
investment, and we make no promise about resale value, if any. It's a bonus,
not a term of the sale itself.</p>

<h2>Shipping</h2>
<p>Orders ship from Dallas, Texas. We aim to get orders out promptly but don't
guarantee a specific delivery date.</p>

<h2>Returns and issues</h2>
<p>If your order arrives damaged, defective, or wrong, contact us at
<a href="mailto:Contact@tooiicy.com">Contact@tooiicy.com</a> within 7 days of
delivery and we'll make it right. Outside of that, sales are final — we don't
currently offer returns for size or preference, so check the fit notes on the
product page before ordering.</p>

<h2>Limitation of liability</h2>
<p>Tooiicy is provided as-is. To the extent permitted by law, we aren't liable
for indirect or consequential damages arising from your use of this site or
purchase of our products.</p>

<h2>Changes</h2>
<p>We may update these terms as the store changes. The date at the top of this
page reflects the last update.</p>

<h2>Governing law</h2>
<p>These terms are governed by the laws of the State of Texas.</p>

<h2>Contact</h2>
<p>Questions: <a href="mailto:Contact@tooiicy.com">Contact@tooiicy.com</a></p>`;

await writeFile('dist/terms.html', legalPage('Terms of Service', TERMS_BODY));
console.log('built terms.html');

const today = new Date().toISOString().slice(0, 10);
await writeFile(
    'dist/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
    `  <url><loc>${SITE}/faq.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>\n` +
    `  <url><loc>${SITE}/privacy.html</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url>\n` +
    `  <url><loc>${SITE}/terms.html</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url>\n` +
    `</urlset>\n`,
);

/**
 * Merchant Center feed, one entry per size. No GTINs exist, so each carries an
 * MPN with identifier_exists=no. Listing still needs a Merchant Center account.
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
 * Catalog export for marketplace onboarding. Generic retail columns rather
 * than any one vendor's schema, so it remaps to whatever template arrives.
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
