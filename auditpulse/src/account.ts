import './styles.css';
import { initAuth, resolveSession, requireSignIn } from './auth.js';
import { apiFetch, ApiError } from './api-client.js';
import { initPricingToggle, type BillingInterval } from './pricing-toggle.js';

initAuth();

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signedOutSection = el<HTMLElement>('signed-out');
const loadingSection = el<HTMLElement>('loading');
const signedInSection = el<HTMLElement>('signed-in');
const planCard = el<HTMLElement>('plan-card');
const statusEl = el<HTMLElement>('status');

type Plan = 'audit' | 'audit_fix';
interface BillingStatus {
    subscriptionStatus: string | null; active: boolean; plan: Plan | null; fixAccess: boolean;
    currentPeriodEnd: string | null; planExpiresAt: string | null;
}

const PLAN_LABEL: Record<Plan, string> = { audit: 'Audit', audit_fix: 'Audit + Fix' };

function renderPlan(billing: BillingStatus): void {
    if (billing.active && billing.plan) {
        const renews = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : null;
        const expires = billing.planExpiresAt ? new Date(billing.planExpiresAt).toLocaleDateString() : null;
        const upsell = billing.plan === 'audit'
            ? `<p class="muted" style="font-size:13px;margin-top:14px">Want automatic fix pull requests too? <button type="button" id="upgrade-fix" class="text-button" style="text-decoration:underline;padding:0">Switch to Audit + Fix</button></p>`
            : '';
        planCard.innerHTML = `
            <div class="badge-pill badge-verified">${PLAN_LABEL[billing.plan]} — active</div>
            <p style="margin-top:10px">Unlimited sites, unlimited audits, and automatic 30-day re-audits.${billing.fixAccess ? ' Includes GitHub auto-fix pull requests.' : ''}
            ${renews ? ` Renews ${renews}.` : expires ? ` Access through ${expires} (one-time annual purchase, does not auto-renew).` : ''}</p>
            ${renews ? '<button type="button" id="manage-billing">Manage billing</button>' : ''}
            ${upsell}`;
        el<HTMLButtonElement>('manage-billing')?.addEventListener('click', openPortal);
        el<HTMLButtonElement>('upgrade-fix')?.addEventListener('click', () => startCheckout('audit_fix', 'month'));
    } else {
        planCard.innerHTML = `
            <div class="badge-pill badge-pending">Free trial</div>
            <p style="margin-top:10px">1 site and 1 full audit included. Choose a plan for unlimited sites and audits.</p>
            <div class="billing-toggle" id="account-billing-toggle" style="margin-top:16px">
                <button type="button" class="toggle-option active" data-interval="month">Monthly</button>
                <button type="button" class="toggle-option" data-interval="year">Annual — pay once</button>
            </div>
            <div class="pricing-grid" style="margin-top:16px">
                <div class="card pricing-card" data-plan="audit">
                    <h2 style="font-size:18px">Audit</h2>
                    <div class="price" style="font-size:32px"><span class="price-amount">$7</span><span class="price-suffix">/month</span></div>
                    <p class="save-badge muted" style="font-size:12px" hidden>One-time fee, no auto-renewal</p>
                    <p class="muted" style="font-size:13px">Unlimited sites &amp; audits, auto 30-day re-audits, unlimited report emails.</p>
                    <button type="button" id="subscribe-audit" class="ghost-button" style="width:100%">Choose Audit</button>
                </div>
                <div class="card pricing-card featured" data-plan="audit_fix">
                    <span class="pricing-badge">Also fixes what it finds</span>
                    <h2 style="font-size:18px">Audit + Fix</h2>
                    <div class="price" style="font-size:32px"><span class="price-amount">$14</span><span class="price-suffix">/month</span></div>
                    <p class="save-badge muted" style="font-size:12px" hidden>One-time fee, no auto-renewal</p>
                    <p class="muted" style="font-size:13px">Everything in Audit, plus GitHub-connected "Fix with PR."</p>
                    <button type="button" id="subscribe-fix" style="width:100%">Choose Audit + Fix</button>
                </div>
            </div>`;
        const getInterval = initPricingToggle(planCard);
        el<HTMLButtonElement>('subscribe-audit').addEventListener('click', () => startCheckout('audit', getInterval()));
        el<HTMLButtonElement>('subscribe-fix').addEventListener('click', () => startCheckout('audit_fix', getInterval()));
    }
}

async function startCheckout(plan: Plan, interval: BillingInterval): Promise<void> {
    statusEl.textContent = 'Redirecting to checkout…';
    statusEl.className = 'status';
    try {
        const { url } = await apiFetch<{ url: string }>('/billing/checkout', { method: 'POST', body: { plan, interval } });
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
        const requestedPlan = params.get('plan');
        const requestedInterval = params.get('interval') === 'year' ? 'year' : 'month';
        if (!billing.active && (requestedPlan === 'audit' || requestedPlan === 'audit_fix')) {
            if (requestedInterval === 'year') {
                el<HTMLElement>('account-billing-toggle')?.querySelector<HTMLButtonElement>('[data-interval="year"]')?.click();
            }
            el<HTMLButtonElement>(requestedPlan === 'audit_fix' ? 'subscribe-fix' : 'subscribe-audit')?.scrollIntoView({ block: 'center' });
        }
    } catch (err) {
        planCard.innerHTML = `<p class="status error">${err instanceof ApiError ? err.message : 'Could not load your plan.'}</p>`;
    }
})();
