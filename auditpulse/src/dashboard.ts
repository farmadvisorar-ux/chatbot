import './styles.css';
import { initAuth, resolveSession, requireSignIn } from './auth.js';
import { apiFetch, ApiError } from './api-client.js';
import { renderFindings, gradeBadgeHtml, summaryChipsHtml, type FindingRow, type SeveritySummary } from './findings-view.js';
import { escapeHtml } from './escape-html.js';

initAuth();

interface Target {
    id: string; url: string; hostname: string; label: string | null;
    verified: boolean; verification_token: string; verification_method: string | null;
    last_scanned_at: string | null; next_rescan_at: string | null; auto_rescan: boolean;
    github_repo: string | null;
}
interface ScanSummaryRow {
    id: string; kind: 'quick' | 'full'; status: 'running' | 'completed' | 'failed';
    score: number | null; grade: string | null; summary: SeveritySummary; started_at: string;
    completed_at: string | null; triggered_by: string; share_token: string;
}
interface BillingStatus { subscriptionStatus: string | null; active: boolean; plan: 'audit' | 'audit_fix' | null; fixAccess: boolean }

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signedOutSection = el<HTMLElement>('signed-out');
const loadingSection = el<HTMLElement>('loading');
const signedInSection = el<HTMLElement>('signed-in');
const targetListEl = el<HTMLElement>('target-list');
const detailPanel = el<HTMLElement>('detail-panel');
const planBanner = el<HTMLElement>('plan-banner');
const toast = el<HTMLElement>('toast');

let targets: Target[] = [];
let selectedTargetId: string | null = null;
let selectedScanId: string | null = null;
let billing: BillingStatus = { subscriptionStatus: null, active: false, plan: null, fixAccess: false };

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

async function loadBilling(): Promise<void> {
    try {
        billing = await apiFetch<BillingStatus>('/billing/status');
    } catch {
        billing = { subscriptionStatus: null, active: false, plan: null, fixAccess: false };
    }
    if (billing.active) {
        if (billing.fixAccess) {
            planBanner.style.display = 'none';
        } else {
            planBanner.style.display = 'block';
            planBanner.innerHTML = `On the <strong>Audit</strong> plan. <a href="/account.html" style="color:var(--accent)">Upgrade to Audit + Fix ($14/mo)</a> to open automatic fix pull requests for fixable findings.`;
        }
    } else {
        planBanner.style.display = 'block';
        planBanner.innerHTML = `<strong>Free trial:</strong> 1 site and 1 full audit included. <a href="/account.html" style="color:var(--accent)">Upgrade to Audit ($7/mo)</a> for unlimited sites and audits, or <a href="/account.html" style="color:var(--accent)">Audit + Fix ($14/mo)</a> to also auto-fix what's found.`;
    }
}

async function loadTargets(): Promise<void> {
    const data = await apiFetch<{ targets: Target[] }>('/targets');
    targets = data.targets;
    renderTargetList();
}

function renderTargetList(): void {
    if (!targets.length) {
        targetListEl.innerHTML = '<div class="empty">No sites yet.</div>';
        return;
    }
    targetListEl.innerHTML = targets.map(t => `
        <div class="target-item ${t.id === selectedTargetId ? 'active' : ''}" data-id="${t.id}">
            <h4>${escapeHtml(t.label || t.hostname)}</h4>
            <div class="meta">${escapeHtml(t.hostname)}</div>
            <div style="margin-top:8px">
                <span class="badge-pill ${t.verified ? 'badge-verified' : 'badge-pending'}">${t.verified ? 'Verified' : 'Unverified'}</span>
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
    detailPanel.innerHTML = '<div class="card center"><span class="spinner"></span></div>';
    await renderDetail();
}

async function renderDetail(): Promise<void> {
    if (!selectedTargetId) return;
    const { target, scans } = await apiFetch<{ target: Target; scans: ScanSummaryRow[] }>(`/targets/${selectedTargetId}`);

    const verificationBlock = target.verified ? `
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

    const githubBlock = target.github_repo ? `
        <div class="card" style="background:var(--surface-2);margin:14px 0">
            <strong>GitHub repo connected</strong>
            <p class="muted" style="font-size:13px">Fixable findings below can open pull requests against <code>${escapeHtml(target.github_repo)}</code>.</p>
            <button type="button" class="ghost-button mini-cta" id="github-disconnect-btn">Disconnect</button>
        </div>
    ` : `
        <div class="card" style="background:var(--surface-2);margin:14px 0">
            <strong>Connect GitHub for auto-fix</strong>
            <p class="muted" style="font-size:13px">Requires the Audit + Fix plan ($14/mo). Once connected, fixable findings (missing security headers, outdated JS libraries, missing security.txt) get a "Fix with PR" button that opens a real pull request.</p>
            <div class="field"><label for="github-repo-input">Repository (owner/repo)</label><input id="github-repo-input" type="text" placeholder="your-org/your-site" autocomplete="off"></div>
            <div class="field"><label for="github-token-input">Fine-grained personal access token</label><input id="github-token-input" type="password" placeholder="github_pat_…" autocomplete="off"></div>
            <p class="muted" style="font-size:12px">Create one at github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens. Limit repository access to just this repo, with permissions Contents (Read and write) and Pull requests (Read and write).</p>
            <button type="button" id="github-connect-btn" class="mini-cta">Connect repo</button>
            <span id="github-connect-status" class="status" style="display:inline-block;margin-left:10px"></span>
        </div>
    `;

    const scansHtml = scans.length ? scans.map(s => `
        <div class="target-item scan-item ${s.id === selectedScanId ? 'active' : ''}" data-id="${s.id}">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <h4>${s.kind === 'full' ? 'Full audit' : 'Quick check'} — ${fmtDate(s.started_at)}</h4>
                    <div class="meta">${s.status === 'running' ? 'Running…' : s.status === 'failed' ? 'Failed' : `Grade ${s.grade} · ${s.score}/100`} ${s.triggered_by === 'auto_rescan' ? '· auto' : ''}</div>
                </div>
            </div>
        </div>`).join('') : '<div class="empty">No scans yet.</div>';

    detailPanel.innerHTML = `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
                <div>
                    <h2>${escapeHtml(target.label || target.hostname)}</h2>
                    <p class="muted" style="font-size:13px">${escapeHtml(target.url)}</p>
                </div>
                <div style="display:flex;gap:8px">
                    <button type="button" id="run-scan-btn" ${!target.verified ? 'disabled title="Verify ownership first"' : ''}>Run full audit</button>
                    <button type="button" class="danger-button" id="delete-target-btn">Delete</button>
                </div>
            </div>
            ${verificationBlock}
            ${githubBlock}
            <p class="muted" style="font-size:12px">Last scanned: ${fmtDate(target.last_scanned_at)} ${target.auto_rescan && target.next_rescan_at ? `· Next auto re-audit: ${fmtDate(target.next_rescan_at)}` : ''}</p>
        </div>

        <h3 style="margin-top:22px;margin-bottom:10px;font-size:16px">Scan history</h3>
        <div id="scan-list">${scansHtml}</div>
        <div id="scan-detail" style="margin-top:16px"></div>
    `;

    el<HTMLButtonElement>('run-scan-btn')?.addEventListener('click', () => runScan(target.id));
    el<HTMLButtonElement>('delete-target-btn')?.addEventListener('click', () => deleteTarget(target.id));
    el<HTMLButtonElement>('verify-btn')?.addEventListener('click', () => checkVerification(target.id));
    el<HTMLButtonElement>('github-connect-btn')?.addEventListener('click', () => connectGithub(target.id));
    el<HTMLButtonElement>('github-disconnect-btn')?.addEventListener('click', () => disconnectGithub(target.id));
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
        const result = await apiFetch<{ verified: boolean }>(`/targets/${targetId}/verify`, { method: 'POST' });
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
        await apiFetch(`/targets/${targetId}/github`, { method: 'POST', body: { repo, token } });
        showToast('GitHub repo connected.');
        await renderDetail();
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Could not connect that repo.';
        statusEl.className = 'status error';
    }
}

async function disconnectGithub(targetId: string): Promise<void> {
    await apiFetch(`/targets/${targetId}/github`, { method: 'DELETE' });
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
        await renderDetail();
        await loadBilling();
    } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Scan failed.', true);
        btn.disabled = false;
        btn.textContent = 'Run full audit';
    }
}

async function deleteTarget(targetId: string): Promise<void> {
    if (!confirm('Remove this site and all its scan history?')) return;
    await apiFetch(`/targets/${targetId}`, { method: 'DELETE' });
    selectedTargetId = null;
    selectedScanId = null;
    detailPanel.innerHTML = '<div class="empty">Select a site on the left, or add a new one to get started.</div>';
    await loadTargets();
}

async function selectScan(scanId: string): Promise<void> {
    selectedScanId = scanId;
    detailPanel.querySelectorAll<HTMLElement>('.scan-item').forEach(item => item.classList.toggle('active', item.dataset.id === scanId));
    const scanDetailEl = el<HTMLElement>('scan-detail');
    scanDetailEl.innerHTML = '<div class="card center"><span class="spinner"></span></div>';

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

// ---- Add target modal ----
const addModal = el<HTMLElement>('add-target-modal');
el<HTMLButtonElement>('add-target-btn').addEventListener('click', () => {
    el<HTMLInputElement>('target-url-input').value = '';
    el<HTMLInputElement>('target-label-input').value = '';
    el<HTMLInputElement>('target-attest-input').checked = false;
    el<HTMLElement>('add-target-status').textContent = '';
    addModal.hidden = false;
});
el<HTMLButtonElement>('add-target-cancel').addEventListener('click', () => { addModal.hidden = true; });
el<HTMLButtonElement>('add-target-submit').addEventListener('click', async () => {
    const statusEl = el<HTMLElement>('add-target-status');
    let url = el<HTMLInputElement>('target-url-input').value.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const label = el<HTMLInputElement>('target-label-input').value.trim();
    const attestedAuthorization = el<HTMLInputElement>('target-attest-input').checked;

    statusEl.textContent = '';
    statusEl.className = 'status';
    try {
        await apiFetch('/targets', { method: 'POST', body: { url, label: label || undefined, attestedAuthorization } });
        addModal.hidden = true;
        await loadTargets();
        showToast('Site added — verify ownership to run a full audit.');
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
}
el<HTMLButtonElement>('email-report-cancel').addEventListener('click', () => { emailModal.hidden = true; });
el<HTMLButtonElement>('email-report-submit').addEventListener('click', async () => {
    if (!emailModalScanId) return;
    const statusEl = el<HTMLElement>('email-report-status');
    const recipient = el<HTMLInputElement>('email-recipient-input').value.trim();
    const note = el<HTMLTextAreaElement>('email-note-input').value.trim();
    statusEl.textContent = 'Sending…';
    statusEl.className = 'status';
    try {
        await apiFetch(`/scans/${emailModalScanId}/email`, { method: 'POST', body: { recipient, note: note || undefined } });
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
    await Promise.all([loadTargets(), loadBilling()]);
})();
