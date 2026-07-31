import './styles.css';
import { initAuth, resolveSession, requireSignIn } from './auth.js';
import { apiFetch, ApiError } from './api-client.js';
import { renderFindings, gradeBadgeHtml, summaryChipsHtml, executiveSummaryHtml, type FindingRow, type SeveritySummary } from './findings-view.js';
import { escapeHtml } from './escape-html.js';

initAuth();

interface Target {
    id: string; url: string; hostname: string; label: string | null;
    verified: boolean; verification_token: string; verification_method: string | null;
    last_scanned_at: string | null; next_rescan_at: string | null; auto_rescan: boolean;
    github_repo: string | null;
    latest_scan_id: string | null; latest_grade: string | null; latest_score: number | null;
    latest_summary: SeveritySummary | null; latest_scanned_at: string | null;
}
interface ScanSummaryRow {
    id: string; kind: 'quick' | 'full'; status: 'running' | 'completed' | 'failed';
    score: number | null; grade: string | null; summary: SeveritySummary; started_at: string;
    completed_at: string | null; triggered_by: string; share_token: string;
}
interface ActivityRow extends ScanSummaryRow { target_id: string; target_label: string | null; hostname: string }
interface BillingStatus {
    subscriptionStatus: string | null; active: boolean; plan: 'audit' | 'audit_fix' | null; fixAccess: boolean;
    currentPeriodEnd: string | null; planExpiresAt: string | null;
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signedOutSection = el<HTMLElement>('signed-out');
const loadingSection = el<HTMLElement>('loading');
const signedInSection = el<HTMLElement>('signed-in');
const targetListEl = el<HTMLElement>('target-list');
const detailPanel = el<HTMLElement>('detail-panel');
const planBanner = el<HTMLElement>('plan-banner');
const statTilesEl = el<HTMLElement>('stat-tiles');
const searchInput = el<HTMLInputElement>('target-search');
const toast = el<HTMLElement>('toast');

let targets: Target[] = [];
let activity: ActivityRow[] = [];
let selectedTargetId: string | null = null;
let selectedScanId: string | null = null;
let searchQuery = '';
let billing: BillingStatus = { subscriptionStatus: null, active: false, plan: null, fixAccess: false, currentPeriodEnd: null, planExpiresAt: null };

// ---------------------------------------------------------------- helpers --

function showToast(message: string, isError = false): void {
    toast.textContent = message;
    toast.className = isError ? 'toast error' : 'toast';
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 4000);
}

function fmtDate(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "3 days ago" / "in 5 days" — makes the site list scannable without reading full timestamps. */
function fmtRelative(value: string | null, future = false): string {
    if (!value) return future ? 'not scheduled' : 'never';
    const diffMs = new Date(value).getTime() - Date.now();
    const diffDays = Math.round(Math.abs(diffMs) / 86_400_000);
    const inPast = diffMs < 0;
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return inPast ? 'yesterday' : 'tomorrow';
    return inPast ? `${diffDays}d ago` : `in ${diffDays}d`;
}

function gradeBucket(grade: string): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (grade.startsWith('A')) return 'A';
    if (grade.startsWith('B')) return 'B';
    if (grade.startsWith('C')) return 'C';
    if (grade.startsWith('D')) return 'D';
    return 'F';
}

function smallGradeBadge(grade: string | null, fallback = ''): string {
    if (!grade) return fallback;
    return `<div class="grade-badge grade-badge-sm grade-${gradeBucket(grade)}">${escapeHtml(grade)}</div>`;
}

/** Higher = more urgent. Unverified/unscanned sites surface above scored ones since their risk is simply unknown. */
function concernScore(t: Target): number {
    if (!t.verified) return 1000;
    if (!t.latest_summary) return 900;
    const s = t.latest_summary;
    return s.critical * 100 + s.high * 30 + s.medium * 8 + s.low * 2;
}

function matchesSearch(t: Target): boolean {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (t.label ?? '').toLowerCase().includes(q) || t.hostname.toLowerCase().includes(q);
}

function sortedFilteredTargets(): Target[] {
    return targets
        .filter(matchesSearch)
        .sort((a, b) => concernScore(b) - concernScore(a) || a.hostname.localeCompare(b.hostname));
}

/** Tiny inline sparkline of scan scores over time — canvas gives crisper lines than hand-built SVG paths at this size. */
function renderSparkline(canvas: HTMLCanvasElement, scores: number[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || scores.length < 2) {
        if (canvas.parentElement) canvas.parentElement.hidden = scores.length < 2;
        return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 160;
    const h = canvas.clientHeight || 36;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...scores, 0);
    const max = Math.max(...scores, 100);
    const pad = 4;
    const points = scores.map((s, i) => {
        const x = pad + (i / (scores.length - 1)) * (w - pad * 2);
        const y = h - pad - ((s - min) / Math.max(1, max - min)) * (h - pad * 2);
        return [x, y];
    });

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#35e0a1';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.75;
    ctx.stroke();

    const [lastX, lastY] = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
}

// ---------------------------------------------------------- data loading --

async function loadBilling(): Promise<void> {
    try {
        billing = await apiFetch<BillingStatus>('/billing/status');
    } catch {
        billing = { subscriptionStatus: null, active: false, plan: null, fixAccess: false, currentPeriodEnd: null, planExpiresAt: null };
    }
    if (billing.active) {
        if (billing.fixAccess) {
            planBanner.style.display = 'none';
        } else {
            planBanner.style.display = 'block';
            planBanner.innerHTML = `On the <strong>Audit</strong> plan. <a href="/account.html" style="color:var(--accent)">Upgrade to Audit + Fix</a> to open automatic fix pull requests for fixable findings.`;
        }
    } else {
        planBanner.style.display = 'block';
        planBanner.innerHTML = `<strong>Free trial:</strong> 1 site and 1 full audit included. <a href="/account.html" style="color:var(--accent)">Upgrade to Audit</a> for unlimited sites and audits, or <a href="/account.html" style="color:var(--accent)">Audit + Fix</a> to also auto-fix what's found.`;
    }
}

async function loadTargets(): Promise<void> {
    const data = await apiFetch<{ targets: Target[] }>('/targets');
    targets = data.targets;
    renderStatTiles();
    renderTargetList();
}

async function loadActivity(): Promise<void> {
    try {
        const data = await apiFetch<{ scans: ActivityRow[] }>('/scans');
        activity = data.scans;
    } catch {
        activity = [];
    }
}

// --------------------------------------------------------------- render --

function renderStatTiles(): void {
    if (!targets.length) {
        statTilesEl.hidden = true;
        return;
    }
    statTilesEl.hidden = false;
    const verified = targets.filter(t => t.verified).length;
    const openSevere = targets.reduce((sum, t) => sum + (t.latest_summary?.critical ?? 0) + (t.latest_summary?.high ?? 0), 0);
    const weekMs = 7 * 86_400_000;
    const dueSoon = targets.filter(t => t.next_rescan_at && new Date(t.next_rescan_at).getTime() - Date.now() < weekMs).length;

    statTilesEl.innerHTML = `
        <div class="stat-tile"><div class="stat-value">${targets.length}</div><div class="stat-label">Site${targets.length === 1 ? '' : 's'}</div></div>
        <div class="stat-tile"><div class="stat-value">${verified}/${targets.length}</div><div class="stat-label">Verified</div></div>
        <div class="stat-tile ${openSevere ? 'stat-tile-warn' : ''}"><div class="stat-value">${openSevere}</div><div class="stat-label">Critical + high findings</div></div>
        <div class="stat-tile"><div class="stat-value">${dueSoon}</div><div class="stat-label">Due for re-audit (7d)</div></div>
    `;
}

function renderTargetList(): void {
    const list = sortedFilteredTargets();
    if (!targets.length) {
        targetListEl.innerHTML = '<div class="empty">No sites yet. Add one to get started.</div>';
        return;
    }
    if (!list.length) {
        targetListEl.innerHTML = '<div class="empty">No sites match your search.</div>';
        return;
    }
    targetListEl.innerHTML = list.map(t => `
        <div class="target-item ${t.id === selectedTargetId ? 'active' : ''}" data-id="${t.id}">
            <div class="target-item-top">
                <div>
                    <h4>${escapeHtml(t.label || t.hostname)}</h4>
                    <div class="meta">${escapeHtml(t.hostname)}</div>
                </div>
                ${smallGradeBadge(t.latest_grade)}
            </div>
            <div class="target-item-bottom">
                <span class="badge-pill ${t.verified ? 'badge-verified' : 'badge-pending'}">${t.verified ? 'Verified' : 'Unverified'}</span>
                ${t.github_repo ? '<span class="badge-pill badge-verified" title="GitHub connected">⚡ Fix-ready</span>' : ''}
                <span class="meta">${t.latest_scanned_at ? `scanned ${fmtRelative(t.latest_scanned_at)}` : 'never scanned'}</span>
            </div>
        </div>`).join('');

    targetListEl.querySelectorAll<HTMLElement>('.target-item').forEach(item => {
        item.addEventListener('click', () => selectTarget(item.dataset.id!));
    });
}

async function selectTarget(id: string): Promise<void> {
    selectedTargetId = id;
    selectedScanId = null;
    renderTargetList();
    detailPanel.innerHTML = renderSkeleton();
    await renderDetail();
}

function showOverview(): void {
    selectedTargetId = null;
    selectedScanId = null;
    renderTargetList();
    renderOverview();
}

function renderSkeleton(): string {
    return `<div class="card"><div class="skeleton-line" style="width:40%"></div><div class="skeleton-line" style="width:65%;margin-top:10px"></div><div class="skeleton-line" style="width:90%;margin-top:22px;height:60px"></div></div>`;
}

function renderOverview(): void {
    if (!targets.length) {
        detailPanel.innerHTML = '<div class="empty">Add your first site to get started — you\'ll see it summarized here once it\'s been audited.</div>';
        return;
    }

    const attention = [...targets].sort((a, b) => concernScore(b) - concernScore(a)).slice(0, 5);
    const attentionHtml = attention.map(t => `
        <div class="attention-row" data-id="${t.id}">
            ${t.latest_grade ? smallGradeBadge(t.latest_grade) : `<div class="grade-badge grade-badge-sm" style="color:var(--muted)">${t.verified ? '?' : '!'}</div>`}
            <div class="attention-info">
                <strong>${escapeHtml(t.label || t.hostname)}</strong>
                <span class="muted">${!t.verified ? 'Needs ownership verification' : !t.latest_summary ? 'Never audited yet' : `${t.latest_summary.critical} critical, ${t.latest_summary.high} high finding(s)`}</span>
            </div>
        </div>`).join('');

    const recentHtml = activity.slice(0, 8).map(s => {
        const indicator = s.status === 'completed' && s.grade
            ? smallGradeBadge(s.grade)
            : `<div class="grade-badge grade-badge-sm" style="color:${s.status === 'failed' ? 'var(--critical)' : 'var(--muted)'}">${s.status === 'failed' ? '✕' : '…'}</div>`;
        return `
        <div class="activity-row" data-target="${s.target_id}" data-scan="${s.id}">
            ${indicator}
            <div class="activity-info">
                <strong>${escapeHtml(s.target_label || s.hostname)}</strong>
                <span class="muted">${s.status === 'running' ? 'Running' : s.status === 'failed' ? 'Failed' : (s.kind === 'full' ? 'Full audit' : 'Quick check')}${s.triggered_by === 'auto_rescan' ? ' · auto' : ''} · ${fmtRelative(s.started_at)}</span>
            </div>
        </div>`;
    }).join('') || '<div class="empty">No scans yet.</div>';

    detailPanel.innerHTML = `
        <div class="card">
            <h3 style="font-size:15px;margin-bottom:4px">Needs attention</h3>
            <p class="muted" style="font-size:12px;margin:0 0 12px">Sorted by risk — unverified and unscanned sites first, then by open critical/high findings.</p>
            <div class="attention-list">${attentionHtml}</div>
        </div>
        <div class="card" style="margin-top:16px">
            <h3 style="font-size:15px;margin-bottom:12px">Recent activity</h3>
            <div class="activity-list">${recentHtml}</div>
        </div>
    `;

    detailPanel.querySelectorAll<HTMLElement>('.attention-row').forEach(row => {
        row.addEventListener('click', () => selectTarget(row.dataset.id!));
    });
    detailPanel.querySelectorAll<HTMLElement>('.activity-row').forEach(row => {
        row.addEventListener('click', async () => {
            await selectTarget(row.dataset.target!);
            if (row.dataset.scan) await selectScan(row.dataset.scan);
        });
    });
}

async function renderDetail(): Promise<void> {
    if (!selectedTargetId) return;
    const { target, scans } = await apiFetch<{ target: Target; scans: ScanSummaryRow[] }>(`/targets/${selectedTargetId}`);

    const setupComplete = target.verified && (target.github_repo || !billing.fixAccess);
    const verificationDone = target.verified;
    const githubDone = Boolean(target.github_repo);

    const verificationBlock = verificationDone ? `
        <p class="status ok">✓ Ownership verified via ${escapeHtml(target.verification_method || 'unknown method')}</p>
    ` : `
        <div class="card" style="background:var(--surface-2);margin:14px 0">
            <strong>Verify ownership to unlock full audits</strong>
            <p class="muted" style="font-size:13px">Prove you control ${escapeHtml(target.hostname)} using either method:</p>
            <p style="font-size:13px"><strong>Option A — file:</strong> publish a file at
                <code>https://${escapeHtml(target.hostname)}/.well-known/auditpulse-verify.txt</code>
                containing exactly:</p>
            <pre style="background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px">${escapeHtml(target.verification_token)}</pre>
            <p style="font-size:13px"><strong>Option B — DNS:</strong> add a TXT record at
                <code>_auditpulse-challenge.${escapeHtml(target.hostname)}</code> with that same value.</p>
            <button type="button" id="verify-btn" class="mini-cta">Check verification</button>
            <span id="verify-status" class="status" style="display:inline-block;margin-left:10px"></span>
        </div>
    `;

    const githubBlock = githubDone ? `
        <p class="status ok">✓ GitHub repo connected: <code>${escapeHtml(target.github_repo!)}</code> <button type="button" class="text-button" id="github-disconnect-btn" style="text-decoration:underline;padding:0;font-size:12px">Disconnect</button></p>
    ` : `
        <div class="card" style="background:var(--surface-2);margin:14px 0">
            <strong>Connect GitHub for auto-fix</strong>
            <p class="muted" style="font-size:13px">Requires the Audit + Fix plan. Once connected, fixable findings get a "Fix with PR" button that opens a real pull request.</p>
            <div class="field"><label for="github-repo-input">Repository (owner/repo)</label><input id="github-repo-input" type="text" placeholder="your-org/your-site" autocomplete="off"></div>
            <div class="field"><label for="github-token-input">Fine-grained personal access token</label><input id="github-token-input" type="password" placeholder="github_pat_…" autocomplete="off"></div>
            <p class="muted" style="font-size:12px">Create one at github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens. Limit repository access to just this repo, with permissions Contents (Read and write) and Pull requests (Read and write).</p>
            <button type="button" id="github-connect-btn" class="mini-cta">Connect repo</button>
            <span id="github-connect-status" class="status" style="display:inline-block;margin-left:10px"></span>
        </div>
    `;

    const setupSummary = setupComplete
        ? `<span class="muted" style="font-weight:400;font-size:12px">— verified${githubDone ? ' · GitHub connected' : ''}</span>`
        : '';
    const setupSectionHtml = `
        <details class="setup-details" ${setupComplete ? '' : 'open'}>
            <summary>Setup ${setupSummary}<span class="chevron">▶</span></summary>
            <div class="setup-body">
                ${verificationBlock}
                ${githubBlock}
            </div>
        </details>
    `;

    const completedScans = scans.filter(s => s.status === 'completed' && s.score !== null).slice().reverse();
    const sparklineHtml = completedScans.length >= 2 ? `
        <div class="sparkline-row">
            <canvas id="score-sparkline" width="160" height="36"></canvas>
            <span class="muted" style="font-size:12px">Score trend, last ${completedScans.length} audits</span>
        </div>` : '';

    const scansHtml = scans.length ? scans.map(s => `
        <div class="target-item scan-item ${s.id === selectedScanId ? 'active' : ''}" data-id="${s.id}">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <h4>${s.kind === 'full' ? 'Full audit' : 'Quick check'} — ${fmtDate(s.started_at)}</h4>
                    <div class="meta">${s.status === 'running' ? 'Running…' : s.status === 'failed' ? 'Failed' : `Grade ${s.grade} · ${s.score}/100`} ${s.triggered_by === 'auto_rescan' ? '· auto' : ''}</div>
                </div>
            </div>
        </div>`).join('') : '<div class="empty">No scans yet.</div>';

    const badgeSvgUrl = `${window.location.origin}/api/targets/${target.id}?action=badge-svg`;
    const verifyPageUrl = `${window.location.origin}/verify.html?t=${target.id}`;
    const embedSnippet = `<a href="${verifyPageUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeSvgUrl}" alt="Secured by AuditPulse" width="168" height="58"></a>`;
    const trustBadgeHtml = target.verified && target.latest_grade ? `
        <div class="card" style="margin-top:16px">
            <h3 style="font-size:15px">Trust badge</h3>
            <p class="muted" style="font-size:13px;margin:6px 0 14px">Show visitors this site is independently, regularly audited. Paste this on your site — it updates automatically as new audits complete, no re-embedding needed.</p>
            <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
                <img src="${badgeSvgUrl}" alt="AuditPulse trust badge preview" width="168" height="58" style="border-radius:10px;flex-shrink:0">
                <div style="flex:1;min-width:220px">
                    <div class="field" style="margin-bottom:8px">
                        <label for="badge-embed-code">Embed code</label>
                        <textarea id="badge-embed-code" readonly rows="3" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;resize:none;width:100%">${escapeHtml(embedSnippet)}</textarea>
                    </div>
                    <button type="button" id="copy-badge-btn" class="mini-cta ghost-button">Copy embed code</button>
                    <a href="${verifyPageUrl}" target="_blank" rel="noopener noreferrer" class="text-button" style="margin-left:4px">Preview verification page →</a>
                </div>
            </div>
        </div>` : '';

    detailPanel.innerHTML = `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
                <div>
                    <div style="display:flex;align-items:center;gap:10px">
                        ${smallGradeBadge(target.latest_grade)}
                        <div>
                            <h2 style="font-size:18px">${escapeHtml(target.label || target.hostname)}</h2>
                            <p class="muted" style="font-size:13px">${escapeHtml(target.url)}</p>
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:8px">
                    <button type="button" id="run-scan-btn" ${!target.verified ? 'disabled title="Verify ownership first"' : ''}>Run full audit</button>
                    <button type="button" class="danger-button" id="delete-target-btn">Delete</button>
                </div>
            </div>
            ${setupSectionHtml}
            <p class="muted" style="font-size:12px;margin-top:10px">Last scanned: ${fmtDate(target.last_scanned_at)} ${target.auto_rescan && target.next_rescan_at ? `· Next auto re-audit: ${fmtDate(target.next_rescan_at)} (${fmtRelative(target.next_rescan_at, true)})` : ''}</p>
        </div>
        ${trustBadgeHtml}

        <div class="card" style="margin-top:16px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <h3 style="font-size:15px">Scan history</h3>
            </div>
            ${sparklineHtml}
            <div id="scan-list" style="margin-top:10px">${scansHtml}</div>
        </div>
        <div id="scan-detail" style="margin-top:16px"></div>
    `;

    if (completedScans.length >= 2) {
        renderSparkline(el<HTMLCanvasElement>('score-sparkline'), completedScans.map(s => s.score!));
    }

    el<HTMLButtonElement>('run-scan-btn')?.addEventListener('click', () => runScan(target.id));
    el<HTMLButtonElement>('delete-target-btn')?.addEventListener('click', () => deleteTarget(target.id));
    el<HTMLButtonElement>('verify-btn')?.addEventListener('click', () => checkVerification(target.id));
    el<HTMLButtonElement>('github-connect-btn')?.addEventListener('click', () => connectGithub(target.id));
    el<HTMLButtonElement>('github-disconnect-btn')?.addEventListener('click', () => disconnectGithub(target.id));
    el<HTMLButtonElement>('copy-badge-btn')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(embedSnippet);
            showToast('Embed code copied.');
        } catch {
            showToast('Could not copy — select the text manually.', true);
        }
    });
    detailPanel.querySelectorAll<HTMLElement>('.scan-item').forEach(item => {
        item.addEventListener('click', () => selectScan(item.dataset.id!));
    });

    const latestCompleted = scans.find(s => s.status === 'completed');
    if (latestCompleted && !selectedScanId) await selectScan(latestCompleted.id);
}

async function checkVerification(targetId: string): Promise<void> {
    const statusEl = el<HTMLElement>('verify-status');
    statusEl.textContent = 'Checking…';
    try {
        const result = await apiFetch<{ verified: boolean }>(`/targets/${targetId}?action=verify`, { method: 'POST' });
        if (result.verified) {
            showToast('Ownership verified!');
            await renderDetail();
        } else {
            statusEl.textContent = 'Not verified yet — add the record/file and try again.';
            statusEl.className = 'status error';
        }
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Verification check failed.';
        statusEl.className = 'status error';
    }
}

async function connectGithub(targetId: string): Promise<void> {
    const statusEl = el<HTMLElement>('github-connect-status');
    const repo = el<HTMLInputElement>('github-repo-input').value.trim();
    const token = el<HTMLInputElement>('github-token-input').value.trim();
    statusEl.textContent = 'Verifying…';
    statusEl.className = 'status';
    try {
        await apiFetch(`/targets/${targetId}?action=github`, { method: 'POST', body: { repo, token } });
        showToast('GitHub repo connected.');
        await renderDetail();
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Could not connect that repo.';
        statusEl.className = 'status error';
    }
}

async function disconnectGithub(targetId: string): Promise<void> {
    await apiFetch(`/targets/${targetId}?action=github`, { method: 'DELETE' });
    showToast('GitHub repo disconnected.');
    await renderDetail();
}

async function runScan(targetId: string): Promise<void> {
    const btn = el<HTMLButtonElement>('run-scan-btn');
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    try {
        const { scanId } = await apiFetch<{ scanId: string }>('/scans', { method: 'POST', body: { targetId } });
        showToast('Audit complete.');
        selectedScanId = scanId;
        await Promise.all([renderDetail(), loadTargets(), loadActivity()]);
    } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Scan failed.', true);
        btn.disabled = false;
        btn.textContent = 'Run full audit';
    }
}

async function deleteTarget(targetId: string): Promise<void> {
    if (!confirm('Remove this site and all its scan history?')) return;
    await apiFetch(`/targets/${targetId}`, { method: 'DELETE' });
    showOverview();
    await loadTargets();
}

async function selectScan(scanId: string): Promise<void> {
    selectedScanId = scanId;
    detailPanel.querySelectorAll<HTMLElement>('.scan-item').forEach(item => item.classList.toggle('active', item.dataset.id === scanId));
    const scanDetailEl = el<HTMLElement>('scan-detail');
    scanDetailEl.innerHTML = renderSkeleton();

    const { scan, findings } = await apiFetch<{ scan: ScanSummaryRow & { share_token: string }; findings: FindingRow[] }>(`/scans/${scanId}`);

    if (scan.status !== 'completed') {
        scanDetailEl.innerHTML = `<div class="card"><p class="status ${scan.status === 'failed' ? 'error' : ''}">${scan.status === 'failed' ? 'This scan failed to complete.' : 'This scan is still running.'}</p></div>`;
        return;
    }

    const reportUrl = `${window.location.origin}/report.html?token=${encodeURIComponent(scan.share_token)}`;
    scanDetailEl.innerHTML = `
        <div class="card">
            <div class="summary-row">${gradeBadgeHtml(scan.grade!, scan.score!)}</div>
            ${summaryChipsHtml(scan.summary)}
            ${executiveSummaryHtml(scan.grade!, scan.score!, findings)}
            <div style="display:flex;gap:10px;margin:14px 0;flex-wrap:wrap">
                <button type="button" id="email-report-btn">Email report to client</button>
                <button type="button" class="ghost-button" id="copy-link-btn">Copy shareable link</button>
            </div>
            <div id="scan-findings"></div>
        </div>`;

    renderFindings(el<HTMLElement>('scan-findings'), findings, billing.fixAccess ? { onFix: handleFix } : {});

    el<HTMLButtonElement>('email-report-btn').addEventListener('click', () => openEmailModal(scanId));
    el<HTMLButtonElement>('copy-link-btn').addEventListener('click', async () => {
        await navigator.clipboard.writeText(reportUrl);
        showToast('Link copied.');
    });
}

async function handleFix(findingId: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.textContent = 'Opening PR…';
    try {
        await apiFetch<{ prUrl: string }>(`/findings/${findingId}/fix`, { method: 'POST' });
        showToast('Fix PR opened.');
        if (selectedScanId) await selectScan(selectedScanId);
    } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Could not open a fix PR.', true);
        button.disabled = false;
        button.textContent = 'Fix with PR →';
    }
}

// ---- Search + overview nav ----
searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderTargetList();
});
el<HTMLButtonElement>('overview-btn').addEventListener('click', showOverview);

// ---- Add target modal ----
const addModal = el<HTMLElement>('add-target-modal');
el<HTMLButtonElement>('add-target-btn').addEventListener('click', () => {
    el<HTMLInputElement>('target-url-input').value = '';
    el<HTMLInputElement>('target-label-input').value = '';
    el<HTMLInputElement>('target-attest-input').checked = false;
    el<HTMLElement>('add-target-status').textContent = '';
    addModal.hidden = false;
    el<HTMLInputElement>('target-url-input').focus();
});
el<HTMLButtonElement>('add-target-cancel').addEventListener('click', () => { addModal.hidden = true; });
addModal.addEventListener('keydown', e => { if (e.key === 'Escape') addModal.hidden = true; });
el<HTMLButtonElement>('add-target-submit').addEventListener('click', async () => {
    const statusEl = el<HTMLElement>('add-target-status');
    let url = el<HTMLInputElement>('target-url-input').value.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const label = el<HTMLInputElement>('target-label-input').value.trim();
    const attestedAuthorization = el<HTMLInputElement>('target-attest-input').checked;

    statusEl.textContent = '';
    statusEl.className = 'status';
    try {
        const { target } = await apiFetch<{ target: Target }>('/targets', { method: 'POST', body: { url, label: label || undefined, attestedAuthorization } });
        addModal.hidden = true;
        await loadTargets();
        showToast('Site added — verify ownership to run a full audit.');
        await selectTarget(target.id);
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Could not add site.';
        statusEl.className = 'status error';
    }
});

// ---- Email report modal ----
const emailModal = el<HTMLElement>('email-report-modal');
let emailModalScanId: string | null = null;
function openEmailModal(scanId: string): void {
    emailModalScanId = scanId;
    el<HTMLInputElement>('email-recipient-input').value = '';
    el<HTMLTextAreaElement>('email-note-input').value = '';
    el<HTMLElement>('email-report-status').textContent = '';
    emailModal.hidden = false;
    el<HTMLInputElement>('email-recipient-input').focus();
}
el<HTMLButtonElement>('email-report-cancel').addEventListener('click', () => { emailModal.hidden = true; });
emailModal.addEventListener('keydown', e => { if (e.key === 'Escape') emailModal.hidden = true; });
el<HTMLButtonElement>('email-report-submit').addEventListener('click', async () => {
    if (!emailModalScanId) return;
    const statusEl = el<HTMLElement>('email-report-status');
    const recipient = el<HTMLInputElement>('email-recipient-input').value.trim();
    const note = el<HTMLTextAreaElement>('email-note-input').value.trim();
    statusEl.textContent = 'Sending…';
    statusEl.className = 'status';
    try {
        await apiFetch(`/scans/${emailModalScanId}?action=email`, { method: 'POST', body: { recipient, note: note || undefined } });
        emailModal.hidden = true;
        showToast(`Report sent to ${recipient}.`);
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Could not send email.';
        statusEl.className = 'status error';
    }
});

// ---- Boot ----
(async () => {
    const signedIn = await resolveSession();
    loadingSection.hidden = true;
    if (!signedIn) {
        signedOutSection.hidden = false;
        el<HTMLButtonElement>('signin').addEventListener('click', async () => {
            if (await requireSignIn()) window.location.reload();
        });
        return;
    }
    signedInSection.hidden = false;
    await Promise.all([loadTargets(), loadBilling(), loadActivity()]);
    showOverview();
})();
