import './styles.css';
import { initAuth, resolveSession, requireSignIn } from './auth.js';
import { apiFetch, ApiError } from './api-client.js';

initAuth();

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signedOutSection = el<HTMLElement>('signed-out');
const loadingSection = el<HTMLElement>('loading');
const signedInSection = el<HTMLElement>('signed-in');
const planCard = el<HTMLElement>('plan-card');
const statusEl = el<HTMLElement>('status');

interface BillingStatus { subscriptionStatus: string | null; active: boolean; currentPeriodEnd: string | null }

function renderPlan(billing: BillingStatus): void {
    if (billing.active) {
        const renews = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : null;
        planCard.innerHTML = `
            <div class="badge-pill badge-verified">Unlimited — active</div>
            <p style="margin-top:10px">Unlimited sites, unlimited audits, and automatic 30-day re-audits.${renews ? ` Renews ${renews}.` : ''}</p>
            <button type="button" id="manage-billing">Manage billing</button>`;
        el<HTMLButtonElement>('manage-billing').addEventListener('click', openPortal);
    } else {
        planCard.innerHTML = `
            <div class="badge-pill badge-pending">Free trial</div>
            <p style="margin-top:10px">1 site and 1 full audit included. Upgrade for unlimited sites, unlimited on-demand audits, and automatic 30-day re-audits with email reports.</p>
            <div class="price">$100<span>/month</span></div>
            <button type="button" id="subscribe">Upgrade to Unlimited</button>`;
        el<HTMLButtonElement>('subscribe').addEventListener('click', startCheckout);
    }
}

async function startCheckout(): Promise<void> {
    statusEl.textContent = 'Redirecting to checkout…';
    statusEl.className = 'status';
    try {
        const { url } = await apiFetch<{ url: string }>('/billing/checkout', { method: 'POST' });
        window.location.href = url;
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Could not start checkout.';
        statusEl.className = 'status error';
    }
}

async function openPortal(): Promise<void> {
    statusEl.textContent = 'Opening billing portal…';
    statusEl.className = 'status';
    try {
        const { url } = await apiFetch<{ url: string }>('/billing/portal', { method: 'POST' });
        window.location.href = url;
    } catch (err) {
        statusEl.textContent = err instanceof ApiError ? err.message : 'Could not open billing portal.';
        statusEl.className = 'status error';
    }
}

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

    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
        statusEl.textContent = "Subscription active — thanks! It may take a few seconds to reflect below.";
        statusEl.className = 'status ok';
    }

    try {
        const billing = await apiFetch<BillingStatus>('/billing/status');
        renderPlan(billing);
    } catch (err) {
        planCard.innerHTML = `<p class="status error">${err instanceof ApiError ? err.message : 'Could not load your plan.'}</p>`;
    }
})();
