import { escapeHtml } from './escape-html.js';

export interface FindingRow {
    id?: string;
    check_id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    impact: string;
    description: string;
    evidence: string | null;
    remediation: string;
    reference_links: string[];
    affected_url: string | null;
    auto_fixable?: boolean;
    fix_status?: 'none' | 'pr_open' | 'pr_merged' | 'failed';
    fix_pr_url?: string | null;
    fix_error?: string | null;
}

export interface SeveritySummary { critical: number; high: number; medium: number; low: number; info: number }

const SEVERITY_ORDER: FindingRow['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_LABEL: Record<FindingRow['severity'], string> = {
    critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info',
};
/** Plain-English urgency guidance shown in the severity glossary — not a technical CVSS-style definition. */
const SEVERITY_GUIDANCE: Record<FindingRow['severity'], string> = {
    critical: 'Fix immediately. Actively exploitable, or already exposing credentials/data.',
    high: 'Fix this week. A real path to serious harm, even if it takes a bit more effort.',
    medium: 'Fix this month. Weakens your defenses but usually needs another factor to cause harm.',
    low: 'Fix when convenient. Minor hardening, unlikely to decide the outcome of an attack on its own.',
    info: 'Good to know. No immediate risk — just useful context about your setup.',
};

export function gradeBadgeHtml(grade: string, score: number): string {
    const bucket = grade.startsWith('A') ? 'A' : grade.startsWith('B') ? 'B' : grade.startsWith('C') ? 'C' : grade.startsWith('D') ? 'D' : 'F';
    return `<div style="display:flex;align-items:center;gap:16px">
        <div class="grade-badge grade-${bucket}">${escapeHtml(grade)}</div>
        <div><div style="font-weight:700;font-size:15px">Security score: ${score}/100</div>
        <div class="muted" style="font-size:13px">Based on ${SEVERITY_ORDER.map(s => `${SEVERITY_LABEL[s]} findings`).join(', ')}</div></div>
    </div>`;
}

export function summaryChipsHtml(summary: SeveritySummary): string {
    return `<div class="summary-chips">${SEVERITY_ORDER.map(sev => `
        <span class="summary-chip"><span class="dot" style="background:var(--${sev})"></span>${summary[sev]} ${SEVERITY_LABEL[sev]}</span>
    `).join('')}</div>`;
}

/**
 * One auto-generated sentence translating grade + findings into what a
 * non-technical site owner should actually do next — shown above the
 * findings list everywhere a scan result is rendered (quick check,
 * dashboard, public report).
 */
export function executiveSummaryHtml(grade: string, score: number, findings: FindingRow[]): string {
    const critical = findings.filter(f => f.severity === 'critical');
    const high = findings.filter(f => f.severity === 'high');
    const actionable = findings.filter(f => f.severity !== 'info');

    let sentence: string;
    if (!findings.length) {
        sentence = `Nothing found by these checks — a clean scan.`;
    } else if (critical.length) {
        sentence = `Scored a ${escapeHtml(grade)} (${score}/100). Top priority: <strong>${escapeHtml(critical[0].title)}</strong>${critical.length > 1 ? ` (plus ${critical.length - 1} more critical issue${critical.length > 2 ? 's' : ''})` : ''} — fix this first.`;
    } else if (high.length) {
        sentence = `Scored a ${escapeHtml(grade)}. No critical issues, but <strong>${escapeHtml(high[0].title)}</strong>${high.length > 1 ? ` (plus ${high.length - 1} more high-priority issue${high.length > 2 ? 's' : ''})` : ''} needs attention soon.`;
    } else if (actionable.length) {
        sentence = `Scored a ${escapeHtml(grade)}. Nothing urgent — ${actionable.length} smaller item${actionable.length > 1 ? 's are' : ' is'} worth cleaning up when convenient.`;
    } else {
        sentence = `Scored a ${escapeHtml(grade)}. No real risk found, just a few informational notes below.`;
    }
    return `<p class="exec-summary">${sentence}</p>`;
}

export function severityGlossaryHtml(): string {
    return `<details class="glossary">
        <summary>What do these severities mean? <span class="chevron">▶</span></summary>
        <div class="glossary-body">
            ${SEVERITY_ORDER.map(sev => `
                <div class="glossary-row">
                    <span class="sev-badge sev-${sev}">${SEVERITY_LABEL[sev]}</span>
                    <span>${escapeHtml(SEVERITY_GUIDANCE[sev])}</span>
                </div>`).join('')}
        </div>
    </details>`;
}

function fixSectionHtml(f: FindingRow, showAction: boolean): string {
    if (f.fix_status === 'pr_open' || f.fix_status === 'pr_merged') {
        return `<div class="fix-row fix-ok">✓ Fix ${f.fix_status === 'pr_merged' ? 'merged' : 'PR opened'} — <a href="${escapeHtml(f.fix_pr_url ?? '#')}" target="_blank" rel="noopener noreferrer">view on GitHub →</a></div>`;
    }
    if (!f.auto_fixable) return '';
    if (!showAction) {
        return `<div class="fix-row muted">Auto-fixable on the Audit + Fix plan.</div>`;
    }
    const errorHtml = f.fix_status === 'failed' && f.fix_error
        ? `<div class="fix-error">${escapeHtml(f.fix_error)}</div>` : '';
    return `<div class="fix-row">
        <button type="button" class="fix-btn" data-fix-id="${escapeHtml(f.id ?? '')}">Fix with PR →</button>
        ${errorHtml}
    </div>`;
}

function findingHtml(f: FindingRow, index: number, showFixAction: boolean): string {
    return `<div class="finding" data-severity="${f.severity}" data-index="${index}">
        <div class="finding-header" data-toggle="${index}">
            <span class="sev-badge sev-${f.severity}">${SEVERITY_LABEL[f.severity]}</span>
            <div class="finding-title-group">
                <h4>${escapeHtml(f.title)}</h4>
                <p class="finding-impact">${escapeHtml(f.impact)}</p>
            </div>
            <span class="chevron">▶</span>
        </div>
        <div class="finding-body">
            <div class="label">Technical details</div>
            <p>${escapeHtml(f.description)}</p>
            ${f.affected_url ? `<div class="label">Affected URL</div><pre>${escapeHtml(f.affected_url)}</pre>` : ''}
            ${f.evidence ? `<div class="label">Evidence</div><pre>${escapeHtml(f.evidence)}</pre>` : ''}
            <div class="label">How to fix it</div>
            <p>${escapeHtml(f.remediation)}</p>
            ${f.reference_links?.length ? `<div class="label">References</div><p>${f.reference_links.map(r => `<a href="${escapeHtml(r)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r)}</a>`).join('<br>')}</p>` : ''}
            ${fixSectionHtml(f, showFixAction)}
        </div>
    </div>`;
}

export interface RenderFindingsOptions {
    /** Present only in the dashboard: called when "Fix with PR" is clicked. Resolves once the fix attempt completes (success or failure). */
    onFix?: (findingId: string, button: HTMLButtonElement) => Promise<void>;
}

/**
 * Renders severity filter chips + the findings list into `container`, and
 * wires up filtering and expand/collapse. Reused by the landing page's free
 * quick check, the dashboard's scan view, and the public report page, so
 * all three present findings identically. The impact line is always
 * visible — even collapsed — so a non-technical reader gets "why should I
 * care" without having to open every row; the technical description,
 * evidence, and references stay behind the expand toggle.
 */
export function renderFindings(container: HTMLElement, findings: FindingRow[], options: RenderFindingsOptions = {}): void {
    if (!findings.length) {
        container.innerHTML = '<div class="empty">No issues found by these checks. Nice work.</div>';
        return;
    }

    const counts: Record<string, number> = {};
    for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

    const filterRow = SEVERITY_ORDER.filter(s => counts[s]).map(sev =>
        `<button type="button" class="filter-chip active" data-filter="${sev}">${SEVERITY_LABEL[sev]} (${counts[sev]})</button>`,
    ).join('');

    container.innerHTML = `
        ${severityGlossaryHtml()}
        <div class="filter-row">${filterRow}<button type="button" class="filter-chip" data-filter="__clear">Clear filters</button></div>
        <div class="findings-list">${findings.map((f, i) => findingHtml(f, i, Boolean(options.onFix))).join('')}</div>
    `;

    const activeFilters = new Set(SEVERITY_ORDER.filter(s => counts[s]));

    const applyFilters = () => {
        container.querySelectorAll<HTMLElement>('.finding').forEach(el => {
            const sev = el.dataset.severity as FindingRow['severity'];
            el.style.display = activeFilters.has(sev) ? '' : 'none';
        });
        container.querySelectorAll<HTMLElement>('.filter-chip[data-filter]').forEach(chip => {
            const key = chip.dataset.filter!;
            if (key === '__clear') return;
            chip.classList.toggle('active', activeFilters.has(key as FindingRow['severity']));
        });
    };

    container.querySelectorAll<HTMLElement>('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.filter!;
            if (key === '__clear') {
                SEVERITY_ORDER.forEach(s => activeFilters.add(s));
            } else if (activeFilters.has(key as FindingRow['severity'])) {
                activeFilters.delete(key as FindingRow['severity']);
            } else {
                activeFilters.add(key as FindingRow['severity']);
            }
            applyFilters();
        });
    });

    container.querySelectorAll<HTMLElement>('[data-toggle]').forEach(header => {
        header.addEventListener('click', () => header.closest('.finding')?.classList.toggle('open'));
    });

    if (options.onFix) {
        container.querySelectorAll<HTMLButtonElement>('[data-fix-id]').forEach(button => {
            button.addEventListener('click', async event => {
                event.stopPropagation();
                const findingId = button.dataset.fixId;
                if (!findingId) return;
                await options.onFix!(findingId, button);
            });
        });
    }
}
