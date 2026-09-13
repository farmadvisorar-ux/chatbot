import { escapeHtml } from './escape-html.js';

export interface TrendPoint {
    score: number;
    grade: string | null;
    at: string;
}

const W = 640;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Grade boundaries from lib/scanner/grade.ts, as recessive reference lines. */
const GRIDLINES = [
    { score: 90, label: 'A' },
    { score: 80, label: 'B' },
    { score: 70, label: 'C' },
];

const x = (i: number, count: number) => PAD.left + (count === 1 ? PLOT_W / 2 : (i / (count - 1)) * PLOT_W);

/**
 * The y-domain always tops out at 100 and never floats its upper bound: the
 * distance left to a perfect score is the point of the chart, and a floating
 * top would redraw "94" as if it were the ceiling. The floor drops to just
 * under the worst score instead of to zero — anchoring at zero pushed every
 * real-world score (which cluster in the 60-100 range) into the top quarter
 * and left most of the plot empty. Clamped to at least a 30-point span so a
 * flat run of near-identical scores doesn't magnify noise into drama.
 */
function domainMin(scores: number[]): number {
    const lowest = Math.min(...scores);
    return Math.max(0, Math.min(lowest - 6, 100 - 30));
}

const yIn = (score: number, min: number) =>
    PAD.top + (1 - (Math.max(min, Math.min(100, score)) - min) / (100 - min)) * PLOT_H;

function shortDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Score-over-time chart for the Plus tier.
 *
 * Deliberately a full chart rather than a bigger sparkline: the y-axis is
 * pinned to 0-100 (a score is an absolute value, so letting the axis float
 * would make a two-point wobble look like a collapse), grade boundaries are
 * drawn as reference lines so a reader can see which band the site is in
 * without decoding numbers, and every point carries a hover target far larger
 * than the dot it belongs to.
 *
 * One series, so there is no legend — the heading names it. The scan list
 * rendered beneath this chart is its table view.
 */
export function trendChartHtml(points: TrendPoint[], windowDays: number): string {
    if (points.length < 2) return '';

    const count = points.length;
    const min = domainMin(points.map(p => p.score));
    const y = (score: number) => yIn(score, min);
    const linePoints = points.map((p, i) => `${x(i, count).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
    const areaPoints = `${PAD.left},${PAD.top + PLOT_H} ${linePoints} ${(PAD.left + PLOT_W).toFixed(1)},${PAD.top + PLOT_H}`;

    // Only boundaries actually inside the domain get a line — an off-scale
    // label pinned to the chart edge would imply a threshold that isn't there.
    const grid = GRIDLINES.filter(g => g.score > min).map(g => `
        <line x1="${PAD.left}" y1="${y(g.score)}" x2="${PAD.left + PLOT_W}" y2="${y(g.score)}"
              stroke="var(--line)" stroke-width="1" stroke-dasharray="3 4" />
        <text x="${PAD.left - 8}" y="${y(g.score) + 4}" text-anchor="end"
              fill="var(--faint)" font-size="10">${g.label}</text>`).join('');

    // Hit targets are full-height columns, so hovering anywhere above or below
    // a point still selects it — the dots themselves are far too small to aim at.
    const hotspots = points.map((p, i) => {
        const cx = x(i, count);
        const band = count === 1 ? PLOT_W : PLOT_W / (count - 1);
        return `<rect class="trend-hit" x="${(cx - band / 2).toFixed(1)}" y="${PAD.top}" width="${band.toFixed(1)}" height="${PLOT_H}"
                      fill="transparent" data-i="${i}" data-cx="${cx.toFixed(1)}" data-cy="${y(p.score).toFixed(1)}"
                      data-label="${escapeHtml(`${shortDate(p.at)} · ${p.score}/100${p.grade ? ` · grade ${p.grade}` : ''}`)}"></rect>`;
    }).join('');

    const dots = points.map((p, i) =>
        `<circle cx="${x(i, count).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="3" fill="var(--accent)" />`).join('');

    const first = shortDate(points[0].at);
    const last = shortDate(points[count - 1].at);

    return `
    <figure class="trend-figure">
        <figcaption class="trend-caption">
            <span>Security score</span>
            <span class="muted">last ${windowDays} days · ${count} audits</span>
        </figcaption>
        <div class="trend-plot">
            <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="none"
                 aria-label="Security score over the last ${windowDays} days, ${count} audits, most recently ${points[count - 1].score} out of 100">
                ${grid}
                <polygon points="${areaPoints}" fill="url(#trend-fade)" />
                <defs>
                    <linearGradient id="trend-fade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.22" />
                        <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
                    </linearGradient>
                </defs>
                <polyline points="${linePoints}" fill="none" stroke="var(--accent)" stroke-width="2"
                          stroke-linejoin="round" stroke-linecap="round" />
                ${dots}
                <line class="trend-crosshair" x1="0" y1="${PAD.top}" x2="0" y2="${PAD.top + PLOT_H}"
                      stroke="var(--line-strong)" stroke-width="1" visibility="hidden" />
                <circle class="trend-marker" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" visibility="hidden" />
                ${hotspots}
            </svg>
            <div class="trend-tooltip" hidden></div>
        </div>
        <div class="trend-axis"><span>${first}</span><span>${last}</span></div>
    </figure>`;
}

/** Wires the crosshair and tooltip. Safe to call when no chart was rendered. */
export function initTrendChart(root: ParentNode): void {
    const plot = root.querySelector<HTMLElement>('.trend-plot');
    if (!plot) return;
    const svg = plot.querySelector('svg');
    const crosshair = plot.querySelector<SVGLineElement>('.trend-crosshair');
    const marker = plot.querySelector<SVGCircleElement>('.trend-marker');
    const tooltip = plot.querySelector<HTMLElement>('.trend-tooltip');
    if (!svg || !crosshair || !marker || !tooltip) return;

    const show = (hit: SVGRectElement): void => {
        const cx = Number(hit.dataset.cx);
        const cy = Number(hit.dataset.cy);
        crosshair.setAttribute('x1', String(cx));
        crosshair.setAttribute('x2', String(cx));
        marker.setAttribute('cx', String(cx));
        marker.setAttribute('cy', String(cy));
        // SVG elements have no `hidden` property — visibility is an attribute here.
        crosshair.setAttribute('visibility', 'visible');
        marker.setAttribute('visibility', 'visible');
        tooltip.textContent = hit.dataset.label ?? '';
        tooltip.hidden = false;
        // The SVG scales to its container, so the pixel position of a point is
        // its viewBox x as a fraction of the full width.
        tooltip.style.left = `${(cx / W) * 100}%`;
        tooltip.style.top = `${(cy / H) * 100}%`;
    };

    const hide = (): void => {
        crosshair.setAttribute('visibility', 'hidden');
        marker.setAttribute('visibility', 'hidden');
        tooltip.hidden = true;
    };

    plot.querySelectorAll<SVGRectElement>('.trend-hit').forEach(hit => {
        hit.addEventListener('pointerenter', () => show(hit));
        hit.addEventListener('pointermove', () => show(hit));
    });
    plot.addEventListener('pointerleave', hide);
}
