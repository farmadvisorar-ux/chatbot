import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { gradeColor } from './badge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(HERE, '..', '..', 'brand', 'fonts');

// Same geometry as brand/generate.mjs's SHIELD/PULSE — keep the two in sync
// if the mark ever changes; duplicated because that script renders via
// Playwright/HTML at build time while this renders via satori/SVG at
// request time, so the two can't share a template.
const SHIELD = 'M32 3.5 56.5 12.6V32c0 14.6-11.2 25.2-24.5 29.2C18.7 57.2 7.5 46.6 7.5 32V12.6Z';
const PULSE = 'M18 32.5h5l4.5-11L35 43l3.5-10.5h6.5';

let fontsCache: { name: string; data: Buffer; weight: 400 | 600 | 800; style: 'normal' }[] | null = null;
function loadFonts() {
    if (!fontsCache) {
        fontsCache = [
            { name: 'DMSans', data: readFileSync(join(FONTS_DIR, 'DMSans-400.ttf')), weight: 400, style: 'normal' },
            { name: 'DMSans', data: readFileSync(join(FONTS_DIR, 'DMSans-600.ttf')), weight: 600, style: 'normal' },
            { name: 'Syne', data: readFileSync(join(FONTS_DIR, 'Syne-800.ttf')), weight: 800, style: 'normal' },
        ];
    }
    return fontsCache;
}

/** Minimal hyperscript so the element tree below needs neither JSX nor a React dependency — satori only needs the {type, props} shape React elements have. */
function h(type: string, props: Record<string, unknown> = {}, ...children: unknown[]) {
    return { type, props: { ...props, children: children.length <= 1 ? children[0] : children } };
}

export type SeveritySummary = { critical: number; high: number; medium: number; low: number; info: number };

export interface ShareCardParams {
    host: string;
    grade: string;
    summary: SeveritySummary;
    dateLabel: string;
}

const SEVERITY_ROWS: { key: keyof SeveritySummary; label: string; color: string }[] = [
    { key: 'critical', label: 'Critical', color: '#ff5c7a' },
    { key: 'high', label: 'High', color: '#ff9f45' },
    { key: 'medium', label: 'Medium', color: '#ffd166' },
    { key: 'low', label: 'Low', color: '#4da6ff' },
];

/** Widths are illustrative (not to scale against each other's absolute counts) — the point is a glanceable shape, same as the static example card in brand/generate.mjs. */
function barWidthPct(count: number): number {
    if (count === 0) return 4;
    return Math.min(100, 12 + count * 14);
}

/**
 * satori lays out a fixed 1200x630 canvas with no scroll/overflow — content
 * taller than that doesn't get "clipped and stay legible", it distorts (a
 * long real-world hostname wrapping the headline to 3-4 lines pushed a
 * flex-centered sibling far enough that its box rendered visibly broken).
 * Truncating the host and scaling the headline down for longer strings
 * keeps every real hostname within the space budgeted for it.
 */
function truncateHost(host: string, max = 28): string {
    return host.length > max ? `${host.slice(0, max - 1)}…` : host;
}

/**
 * Renders a 1200x630 share card for one real scan — the dynamic counterpart
 * to brand/generate.mjs's static og-image.png, driven by this scan's actual
 * host/grade/findings instead of the fixed example data. Used by api/og.ts.
 */
export async function renderShareCardPng(params: ShareCardParams): Promise<Buffer> {
    const accent = gradeColor(params.grade);
    const totalFindings = Object.values(params.summary).reduce((a, b) => a + b, 0);
    const displayHost = truncateHost(params.host);
    const headline = `${displayHost} scored ${params.grade}`;
    // Longer strings wrap to more lines at a fixed size, so scale down to
    // keep the headline within roughly two lines regardless of hostname length.
    const headlineFontSize = headline.length > 34 ? 38 : headline.length > 24 ? 44 : 50;

    const mark = h('svg', { width: 50, height: 50, viewBox: '0 0 64 64' },
        h('path', { fill: accent, d: SHIELD }),
        h('path', { fill: 'none', stroke: '#04140d', strokeWidth: 7.5, strokeLinecap: 'round', strokeLinejoin: 'round', d: PULSE }),
    );

    const brandRow = h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
        mark,
        h('span', { style: { display: 'flex', fontFamily: 'Syne', fontWeight: 800, fontSize: 36, color: '#e9edf5', letterSpacing: -0.5 } }, 'AuditPulse'),
    );

    const chip = (text: string) => h('div', {
        style: {
            display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #262d3d', backgroundColor: '#12161f',
            borderRadius: 999, padding: '11px 20px', fontSize: 17, fontWeight: 600, color: '#c9d2e0',
        },
    }, text);

    const left = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 } },
        brandRow,
        h('div', {
            style: {
                display: 'flex', fontFamily: 'Syne', fontWeight: 800, fontSize: headlineFontSize, lineHeight: 1.15,
                color: '#f2f5fa', letterSpacing: -1.5, marginTop: 40, maxWidth: 560,
            },
        }, headline),
        h('div', { style: { display: 'flex', marginTop: 22, fontSize: 21, lineHeight: 1.45, color: '#93a0b5', maxWidth: 520 } },
            '18 real security checks, explained in plain English — with the fixes.'),
        h('div', { style: { display: 'flex', gap: 11, marginTop: 34, flexWrap: 'wrap' } },
            chip(`${totalFindings} finding${totalFindings === 1 ? '' : 's'}`),
            chip('Free forever'),
            chip('Weekly re-audits'),
        ),
    );

    const severityRow = (key: keyof SeveritySummary, label: string, color: string) => h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 17 },
    },
        h('div', { style: { display: 'flex', width: 11, height: 11, borderRadius: 3, backgroundColor: color, flexShrink: 0 } }),
        h('div', { style: { display: 'flex', fontSize: 17, color: '#c9d2e0', flex: 1 } }, label),
        h('div', { style: { display: 'flex', width: 110, height: 7, borderRadius: 4, backgroundColor: '#222938', overflow: 'hidden' } },
            h('div', { style: { display: 'flex', height: '100%', borderRadius: 4, width: `${barWidthPct(params.summary[key])}%`, backgroundColor: color } }),
        ),
    );

    const statCard = h('div', {
        style: {
            display: 'flex', flexDirection: 'column', width: 400, flexShrink: 0,
            backgroundColor: '#12161f', border: '1px solid #242b3a', borderRadius: 22, padding: 32,
        },
    },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 } },
            h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
                h('div', { style: { display: 'flex', fontSize: 21, fontWeight: 600, color: '#e9edf5', maxWidth: 260 } }, displayHost),
                h('div', { style: { display: 'flex', fontSize: 15, color: '#6b7688', marginTop: 6 } }, `audited ${params.dateLabel}`),
            ),
            h('div', {
                style: {
                    display: 'flex', width: 78, height: 78, borderRadius: 18, backgroundColor: `${accent}22`,
                    border: `1px solid ${accent}73`, alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Syne', fontWeight: 800, fontSize: 36, color: accent,
                },
            }, params.grade),
        ),
        ...SEVERITY_ROWS.map(row => severityRow(row.key, row.label, row.color)),
    );

    const root = h('div', {
        style: {
            display: 'flex', width: 1200, height: 630, backgroundColor: '#0a0d13', fontFamily: 'DMSans',
            padding: 64, gap: 56, alignItems: 'center', overflow: 'hidden',
        },
    }, left, statCard);

    const svg = await satori(root as never, { width: 1200, height: 630, fonts: loadFonts() });
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    return resvg.render().asPng();
}
