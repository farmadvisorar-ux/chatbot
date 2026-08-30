import { mkdir, writeFile } from 'node:fs/promises';

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

const ANALYTICS_SCRIPT = `
<script>
(function(){
  const TRACK_URL='https://tooiicy-analytics-wordwide-top-10.vercel.app/api/track';
  const SESSION_KEY='tooiicy_session_' + new Date().toISOString().split('T')[0];
  let session=sessionStorage.getItem(SESSION_KEY);
  if(!session){
    session=Math.random().toString(36).substring(2,15);
    sessionStorage.setItem(SESSION_KEY,session);
  }
  function track(e,m){
    navigator.sendBeacon(TRACK_URL,new Blob([JSON.stringify({
      page_view:e==='page_view'?1:0,select_size:e==='select_size'?1:0,add_to_cart:e==='add_to_cart'?1:0,
      open_cart:e==='open_cart'?1:0,begin_checkout:e==='begin_checkout'?1:0,session:session,page:m||window.location.pathname
    })],{type:'text/plain'}),TRACK_URL);
  }
  track('page_view');
  window.trackEvent=track;
})();
</script>
`;

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
