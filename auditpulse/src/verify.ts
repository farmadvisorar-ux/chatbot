import './styles.css';
import { escapeHtml } from './escape-html.js';

interface BadgeInfo {
    hostname: string;
    label: string | null;
    verified: boolean;
    grade: string | null;
    score: number | null;
    lastScannedAt: string | null;
    autoRescan: boolean;
}

const root = document.getElementById('verify-root')!;
const targetId = new URLSearchParams(window.location.search).get('t');

root.addEventListener('click', event => {
    const nav = (event.target as HTMLElement).closest<HTMLElement>('[data-nav]');
    if (nav) window.location.href = nav.dataset.nav!;
});

function invalidCard(message: string): string {
    return `<div class="card center">
        <h1 style="font-size:20px">Verification not found</h1>
        <p class="muted" style="margin:10px 0 20px">${escapeHtml(message)}</p>
        <button type="button" data-nav="/">Run your own free audit →</button>
    </div>`;
}

async function load(): Promise<void> {
    if (!targetId) {
        root.innerHTML = invalidCard('No site was specified in this link.');
        return;
    }
    try {
        const res = await fetch(`/api/targets/${encodeURIComponent(targetId)}?action=badge-info`);
        const data: BadgeInfo & { error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error || 'Not found.');
        render(data);
    } catch {
        root.innerHTML = invalidCard('This verification link is invalid, or the site is no longer monitored by AuditPulse.');
    }
}

function render(info: BadgeInfo): void {
    const siteName = info.label || info.hostname;
    const hasResult = info.verified && info.grade;

    if (!hasResult) {
        root.innerHTML = `<div class="card center">
            <span class="eyebrow">AuditPulse verification</span>
            <h1 style="font-size:22px;margin-top:10px">${escapeHtml(siteName)}</h1>
            <p class="muted" style="margin:10px 0 20px">This site has been added to AuditPulse but doesn't have a completed, verified audit yet. Check back after the owner finishes domain verification and runs a full audit.</p>
            <button type="button" data-nav="/">Run your own free audit →</button>
        </div>`;
        return;
    }

    const lastChecked = info.lastScannedAt
        ? new Date(info.lastScannedAt).toLocaleDateString('en-US', { dateStyle: 'long' })
        : 'unknown';
    const grade = info.grade!;
    const bucket = grade.startsWith('A') ? 'A' : grade.startsWith('B') ? 'B' : grade.startsWith('C') ? 'C' : grade.startsWith('D') ? 'D' : 'F';

    root.innerHTML = `<div class="card">
        <span class="eyebrow">AuditPulse verification</span>
        <h1 style="font-size:24px;margin:12px 0 4px">${escapeHtml(siteName)}</h1>
        <p class="muted" style="font-size:13px;margin-bottom:20px">${escapeHtml(info.hostname)}</p>
        <div style="display:flex;align-items:center;gap:16px">
            <div class="grade-badge grade-${bucket}">${escapeHtml(grade)}</div>
            <div style="font-weight:700;font-size:15px">Security score: ${info.score ?? 0}/100</div>
        </div>
        <p class="status ok" style="margin-top:16px">✓ Ownership verified · last audited ${escapeHtml(lastChecked)}</p>
        <p class="muted" style="font-size:13px;margin-top:14px;line-height:1.6">
            This confirms ${escapeHtml(info.hostname)} was independently audited by AuditPulse using automated, passive, non-destructive security checks.
            ${info.autoRescan ? 'This site is on automatic monthly re-audit, so this result reflects a current check, not a one-time snapshot.' : 'AuditPulse never publishes vulnerability details publicly — only the site owner can view the full findings report.'}
        </p>
        <p style="margin-top:24px">
            <button type="button" class="ghost-button" data-nav="/">Get your own free audit →</button>
        </p>
    </div>`;
}

load();
