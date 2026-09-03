/**
 * Regenerates every brand asset in public/ from the definitions in this file.
 *
 *   node brand/generate.mjs
 *
 * Run it after changing the mark geometry or the share-card layout, then
 * commit whatever changes in public/. Requires playwright (for rasterising
 * and for the share card) — see brand/README.md.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '..', 'public');
const out = name => join(PUBLIC, name);

// ---------------------------------------------------------------- the mark
// Shield = the audit. Pulse = the weekly re-check that never stops.
// The stroke weight and amplitude were picked by rendering candidates at
// 16px: lighter strokes silt up into an unreadable squiggle, heavier ones
// close the counters and turn the shield into a blob.
const SHIELD = 'M32 3.5 56.5 12.6V32c0 14.6-11.2 25.2-24.5 29.2C18.7 57.2 7.5 46.6 7.5 32V12.6Z';
const PULSE = 'M18 32.5h5l4.5-11L35 43l3.5-10.5h6.5';
const PULSE_WIDTH = 7.5;
const INK = '#04140d';

const gradient = id =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cf0bb"/><stop offset="1" stop-color="#22c98c"/></linearGradient>`;
const markBody = id => `<path fill="url(#${id})" d="${SHIELD}"/>
  <path fill="none" stroke="${INK}" stroke-width="${PULSE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" d="${PULSE}"/>`;

// ------------------------------------------------------------ the wordmark
// wordmark.json holds Syne ExtraBold outlines for "AuditPulse", extracted
// once with fontTools (see README). A logo must not depend on a font being
// installed: as live <text> it rendered in whatever fallback the viewer had.
const word = JSON.parse(readFileSync(join(HERE, 'wordmark.json'), 'utf8'));
const FONT_SIZE = 26;
const scale = FONT_SIZE / word.upm;
const [minX, , maxX, maxY] = word.bbox;
const wordWidth = (maxX - minX) * scale;
const capHeight = maxY * scale;

const wordmark = (x, baseline, fill) => {
    // Advances stay in font units; the outer transform scales them and flips
    // the axis (font space is Y-up, SVG is Y-down) in one step.
    const glyphs = word.parts
        .map(([d, adv]) => `<path d="${d}" transform="translate(${(adv - minX).toFixed(1)} 0)"/>`)
        .join('');
    return `<g fill="${fill}" transform="translate(${x} ${baseline}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})">${glyphs}</g>`;
};

const MARK_SIZE = 64;
const GAP = 16;
const wordX = MARK_SIZE + GAP;
// Optically centred on cap height rather than the em box, which sits low.
const baseline = MARK_SIZE / 2 + capHeight / 2;
const lockupWidth = Math.ceil(wordX + wordWidth);

const lockup = (fill, note) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lockupWidth} ${MARK_SIZE}" role="img" aria-label="AuditPulse">
  <title>AuditPulse</title>
  <!-- Horizontal lockup: mark + wordmark. The wordmark is outlined Syne
       ExtraBold, so it renders identically everywhere with no webfont. ${note} -->
  <defs>${gradient('ap-lockup')}</defs>
  ${markBody('ap-lockup')}
  ${wordmark(wordX, baseline, fill)}
</svg>
`;

const square = (id, note) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="AuditPulse">
  <title>AuditPulse</title>
  <!-- ${note} -->
  <defs>${gradient(id)}</defs>
  ${markBody(id)}
</svg>
`;

writeFileSync(out('logo.svg'), lockup('#e9edf5', 'Light wordmark, for dark backgrounds.'));
writeFileSync(out('logo-on-light.svg'), lockup('#0a0d13', 'Dark wordmark, for light backgrounds.'));
writeFileSync(out('favicon.svg'), square('ap-shield', 'Two shapes, one colour pair. Verified legible down to 16px in a tab.'));
writeFileSync(out('mark.svg'), square('ap-mark', 'Standalone mark, for avatars and the site header.'));
console.log(`svg      logo lockup ${lockupWidth}x${MARK_SIZE}, wordmark ${wordWidth.toFixed(1)} wide`);

// ----------------------------------------------------------------- rasters
// CHROMIUM_PATH lets a sandbox or CI image point at a preinstalled browser
// instead of Playwright's own download.
const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const markSvg = readFileSync(out('mark.svg'), 'utf8');

/**
 * Tab icons ship transparent so the shield sits on the browser's own chrome.
 * Home-screen and Apple icons get a dark plate: iOS composites a transparent
 * PNG onto black and squares the corners itself, so the plate is what keeps
 * the mark off the edge.
 */
async function raster(size, plate) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const pad = plate ? Math.round(size * 0.18) : 0;
    const radius = plate ? Math.round(size * 0.22) : 0;
    await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px">
      <div style="width:${size}px;height:${size}px;${plate ? `background:#0a0d13;border-radius:${radius}px;` : ''}display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:${pad}px">
        <div style="width:100%;height:100%">${markSvg.replace('<svg', '<svg width="100%" height="100%"')}</div>
      </div></body>`);
    const buf = await page.screenshot({ omitBackground: !plate });
    await page.close();
    return buf;
}

for (const [name, size, plate] of [
    ['icon-16.png', 16, false],
    ['icon-32.png', 32, false],
    ['icon-192.png', 192, true],
    ['icon-512.png', 512, true],
    ['apple-touch-icon.png', 180, true],
]) {
    writeFileSync(out(name), await raster(size, plate));
}
console.log('rasters  icon-16/32 transparent, icon-192/512 + apple-touch-icon plated');

// favicon.ico bundles the two tab sizes as PNG payloads (supported Vista+).
// Browsers request /favicon.ico on their own regardless of the markup.
const icoParts = [16, 32].map(s => ({ s, data: readFileSync(out(`icon-${s}.png`)) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoParts.length, 4);
let offset = 6 + 16 * icoParts.length;
const dir = icoParts.map(({ s, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s, 0); e.writeUInt8(s, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
});
writeFileSync(out('favicon.ico'), Buffer.concat([header, ...dir, ...icoParts.map(p => p.data)]));
console.log('ico      favicon.ico, 16 + 32');

// -------------------------------------------------------------- share card
// 1200x630 is what every scraper (iMessage, WhatsApp, Slack, LinkedIn,
// Facebook, X) expects for a large summary card. Fonts are embedded as data
// URIs so the render is deterministic and needs no network.
const fontFace = (family, weight, file) =>
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${readFileSync(join(HERE, 'fonts', file)).toString('base64')}) format('truetype')}`;

const severities = [['#ff5c7a', 'Critical', 18], ['#ff9f45', 'High', 46], ['#ffd166', 'Medium', 72], ['#4da6ff', 'Low', 34]];

const card = `<style>
${fontFace('Syne', 800, 'Syne-800.ttf')}
${fontFace('DMSans', 400, 'DMSans-400.ttf')}
${fontFace('DMSans', 600, 'DMSans-600.ttf')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#0a0d13;font-family:DMSans,sans-serif;position:relative;overflow:hidden}
.glow{position:absolute;width:900px;height:900px;left:-320px;top:-500px;border-radius:50%;
  background:radial-gradient(circle,rgba(53,224,161,.16) 0%,rgba(53,224,161,0) 66%)}
.wrap{position:relative;display:flex;height:100%;padding:64px;gap:56px;align-items:center}
.left{flex:1;min-width:0}
.brand{display:flex;align-items:center;gap:16px;margin-bottom:40px}
.brand svg{width:50px;height:50px}
.brand span{font-family:Syne;font-weight:800;font-size:36px;color:#e9edf5;letter-spacing:-.5px}
h1{font-family:Syne;font-weight:800;font-size:50px;line-height:1.1;color:#f2f5fa;letter-spacing:-1.5px}
h1 em{font-style:normal;color:#35e0a1}
p{margin-top:22px;font-size:21px;line-height:1.45;color:#93a0b5;max-width:20ch}
.chips{display:flex;gap:11px;margin-top:34px;flex-wrap:wrap}
.chip{border:1px solid #262d3d;background:#12161f;border-radius:999px;padding:11px 20px;
  font-size:17px;font-weight:600;color:#c9d2e0;display:flex;align-items:center;gap:9px}
.dot{width:8px;height:8px;border-radius:50%;background:#35e0a1}
.card{width:400px;flex-shrink:0;background:#12161f;border:1px solid #242b3a;border-radius:22px;padding:32px}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px}
.host{font-size:21px;font-weight:600;color:#e9edf5}
.when{font-size:15px;color:#6b7688;margin-top:6px}
.grade{width:78px;height:78px;border-radius:18px;background:rgba(53,224,161,.13);
  border:1px solid rgba(53,224,161,.45);display:flex;align-items:center;justify-content:center;
  font-family:Syne;font-weight:800;font-size:36px;color:#35e0a1}
.row{display:flex;align-items:center;gap:12px;margin-top:17px}
.sw{width:11px;height:11px;border-radius:3px;flex-shrink:0}
.lbl{font-size:17px;color:#c9d2e0;flex:1}
/* .bar and .fill must be block: .bar is blockified as a flex child, but
   .fill's parent is not a flex container, so as an inline it would ignore
   its width and every severity bar would render empty. */
.bar{display:block;width:110px;height:7px;border-radius:4px;background:#222938;overflow:hidden}
.fill{display:block;height:100%;border-radius:4px}
</style>
<div class="glow"></div>
<div class="wrap">
  <div class="left">
    <div class="brand">${markSvg}<span>AuditPulse</span></div>
    <h1>Find every <em>vulnerability</em> before someone else does.</h1>
    <p>18 real security checks, explained in plain English — with the fixes.</p>
    <div class="chips">
      <div class="chip"><span class="dot"></span>Free forever</div>
      <div class="chip">18 security checks</div>
      <div class="chip">Weekly re-audits</div>
    </div>
  </div>
  <div class="card">
    <div class="card-top">
      <div><div class="host">example.com</div><div class="when">audited just now</div></div>
      <div class="grade">B-</div>
    </div>
    ${severities.map(([c, l, w]) => `<div class="row"><span class="sw" style="background:${c}"></span><span class="lbl">${l}</span><span class="bar"><span class="fill" style="width:${w}%;background:${c}"></span></span></div>`).join('')}
  </div>
</div>`;

const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(card);
await page.evaluate(() => document.fonts.ready);
writeFileSync(out('og-image.png'), await page.screenshot());
await browser.close();
console.log('share    og-image.png 1200x630');
