import './styles.css';
import { initAuth, requireSignIn } from './auth.js';
import { apiFetch, ApiError } from './api-client.js';
import { renderFindings, gradeBadgeHtml, summaryChipsHtml, type FindingRow, type SeveritySummary } from './findings-view.js';
import { initPricingToggle } from './pricing-toggle.js';

initAuth();
const getBillingInterval = initPricingToggle();

const form = document.querySelector<HTMLFormElement>('#quick-check-form')!;
const input = document.querySelector<HTMLInputElement>('#quick-check-url')!;
const submitButton = document.querySelector<HTMLButtonElement>('#quick-check-submit')!;
const statusEl = document.querySelector<HTMLElement>('#quick-check-status')!;
const resultEl = document.querySelector<HTMLElement>('#quick-check-result')!;

interface QuickCheckResponse { score: number; grade: string; summary: SeveritySummary; findings: FindingRow[] }

form.addEventListener('submit', async event => {
    event.preventDefault();
    let url = input.value.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    submitButton.disabled = true;
    submitButton.textContent = 'Scanning…';
    statusEl.textContent = '';
    statusEl.className = 'status';
    resultEl.hidden = true;

    try {
        const data = await apiFetch<QuickCheckResponse>('/quick-check', { method: 'POST', body: { url } });
        resultEl.innerHTML = `
            <div class="card">
                <div class="summary-row">${gradeBadgeHtml(data.grade, data.score)}</div>
                ${summaryChipsHtml(data.summary)}
                <div id="quick-findings" style="margin-top:16px"></div>
                <p class="muted" style="font-size:13px;margin-top:18px">This free check only looked at response headers, TLS, and cookies. <a href="#pricing" style="color:var(--accent)">Sign up</a> to run a full audit (exposed files, CORS, DNS security, outdated libraries, and more) with automatic re-audits every 30 days.</p>
            </div>`;
        renderFindings(document.querySelector('#quick-findings')!, data.findings);
        resultEl.hidden = false;
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
        statusEl.className = 'status error';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Scan for free';
    }
});

document.querySelectorAll<HTMLButtonElement>('.pricing-cta').forEach(button => {
    button.addEventListener('click', async () => {
        const signedIn = await requireSignIn();
        if (!signedIn) return;
        const plan = button.dataset.plan;
        window.location.href = plan ? `/account.html?plan=${encodeURIComponent(plan)}&interval=${getBillingInterval()}` : '/dashboard.html';
    });
});
