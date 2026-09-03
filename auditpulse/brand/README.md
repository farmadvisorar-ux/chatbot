# Brand assets

Everything in `public/` that carries the brand — the mark, the logo lockups,
every favicon and app icon, and the social share card — is generated from
`generate.mjs`. Edit that file, re-run it, and commit the result:

```bash
npm i -D playwright   # only needed to regenerate
node brand/generate.mjs

# If the environment already has a browser, point at it instead of
# letting Playwright download one:
CHROMIUM_PATH=/opt/pw-browsers/chromium node brand/generate.mjs
```

It writes `favicon.svg`, `mark.svg`, `logo.svg`, `logo-on-light.svg`,
`icon-16/32/192/512.png`, `apple-touch-icon.png`, `favicon.ico` and
`og-image.png` into `public/`.

## What's here

| File | Purpose |
| --- | --- |
| `generate.mjs` | The single source of truth for the mark geometry and share-card layout |
| `wordmark.json` | "AuditPulse" as Syne ExtraBold outlines |
| `fonts/` | Instanced static fonts used to render the share card, plus their licenses |

## Why the wordmark is outlined

The lockup previously set the wordmark as live `<text>` with a font fallback
chain. That silently rendered in whatever face the viewer happened to have,
so the logo was only correct on a machine with Syne installed — and on one
that *did* have it, the real wordmark needed 303 units of a 260-unit viewBox
and the end of the name was clipped.

`wordmark.json` holds the glyph outlines instead, so the lockup renders
identically everywhere with no webfont and no clipping. It was extracted once
with [fontTools](https://github.com/fonttools/fonttools); regenerate it only
if the name or typeface changes:

```bash
pip install fonttools brotli
# Syne is a variable font, so pin the weight axis before extracting outlines.
python3 - <<'PY'
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
import json

font = instantiateVariableFont(TTFont('Syne[wght].ttf'), {'wght': 800}, inplace=True)
glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
x, parts = 0, []
minx = miny = 1e9
maxx = maxy = -1e9
for ch in 'AuditPulse':
    name = cmap[ord(ch)]
    pen = SVGPathPen(glyphs); glyphs[name].draw(pen)
    bounds = BoundsPen(glyphs); glyphs[name].draw(bounds)
    if bounds.bounds:
        x0, y0, x1, y1 = bounds.bounds
        minx, maxx = min(minx, x0 + x), max(maxx, x1 + x)
        miny, maxy = min(miny, y0), max(maxy, y1)
    if pen.getCommands():
        parts.append([pen.getCommands(), x])
    x += hmtx[name][0]

json.dump({'upm': font['head'].unitsPerEm, 'parts': parts,
           'bbox': [minx, miny, maxx, maxy], 'adv': x}, open('wordmark.json', 'w'))
PY
```

## Constraints worth keeping

- **The mark has to survive 16px.** Stroke weight and pulse amplitude were
  chosen by rendering candidates at tab size against light, dark and brand
  backgrounds. Lighter strokes silt up into a squiggle; heavier ones close
  the counters and the shield reads as a blob.
- **Small icons stay transparent, large ones get a plate.** iOS composites a
  transparent PNG onto black and squares the corners itself, so the Apple and
  home-screen icons need the dark plate to keep the mark off the edge.
- **`og-image.png` must stay 1200x630.** That is what every link-preview
  scraper expects for a large card, and its URL must stay stable — scrapers
  cache the image by URL, so a content-hashed filename would break previews
  that were already shared.

## Fonts

Syne and DM Sans are both under the SIL Open Font License; the license texts
sit alongside them in `fonts/`. The `.ttf` files here are static instances
pinned to a single weight, not the upstream variable fonts.
