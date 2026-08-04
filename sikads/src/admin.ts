import './admin.css';
import { escapeHtml } from './escape-html';

type Campaign = {
    id: string; advertiserEmail: string; headline: string; url: string;
    cpmCents: number; budgetCents: number; viewsPurchased: number; viewsRemaining: number;
    status: 'pending_review' | 'live' | 'rejected' | 'exhausted'; paidAt: string | null; createdAt: string;
};
type Revenue = { totalCents: number; campaigns: number };

const STORAGE_KEY = 'sikads_admin_key';
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

const loginSection = $('#admin-login');
const appSection = $('#admin-app');
const loginForm = $<HTMLFormElement>('#login-form');
const keyInput = $<HTMLInputElement>('#admin-key');
const rememberInput = $<HTMLInputElement>('#remember');
const loginStatus = $('#login-status');
const adsList = $('#ads-list');
const statsEl = $('#stats');

let adminKey = '';

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const perThousand = (cents: number): string => `${money(cents)}/1,000`;
const day = (value: string | null): string => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

async function callAdmin<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${adminKey}`,
        },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
    return payload as T;
}

function renderStats(revenue: Revenue, queue: Campaign[]): void {
    const pending = queue.filter(c => c.status === 'pending_review').length;
    const live = queue.filter(c => c.status === 'live').length;
    statsEl.innerHTML = [
        ['Total revenue', money(revenue.totalCents)],
        ['Campaigns', String(revenue.campaigns)],
        ['Awaiting review', String(pending)],
        ['Live now', String(live)],
    ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label!)}</span><b>${escapeHtml(value!)}</b></div>`).join('');
}

function renderQueue(items: Campaign[]): void {
    adsList.innerHTML = items.length ? items.map(item => `
      <article class="item${item.status === 'pending_review' ? ' is-pending' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="item-head">
          <h3>${escapeHtml(item.headline)}</h3>
          <span class="badge ${item.status}">${item.status.replace('_', ' ')}</span>
        </div>
        <p class="meta">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
          &nbsp;·&nbsp; <a href="mailto:${escapeHtml(item.advertiserEmail)}">${escapeHtml(item.advertiserEmail)}</a>
          &nbsp;·&nbsp; paid ${escapeHtml(day(item.paidAt))}
        </p>
        <div class="amounts">
          <div><b>${escapeHtml(money(item.budgetCents))}</b>total paid</div>
          <div><b>${escapeHtml(perThousand(item.cpmCents))}</b>their price</div>
          <div><b>${escapeHtml(item.viewsRemaining.toLocaleString())} / ${escapeHtml(item.viewsPurchased.toLocaleString())}</b>views left</div>
        </div>
        ${item.status === 'pending_review' ? `
        <div class="row">
          <button type="button" data-action="approve">Approve — go live</button>
          <button type="button" class="ghost danger" data-action="reject">Reject</button>
        </div>` : ''}
      </article>`).join('') : `<div class="empty">Nothing to review yet.</div>`;
}

async function loadQueue(): Promise<void> {
    const data = await callAdmin<{ queue: Campaign[]; revenue: Revenue }>('/api/admin');
    renderStats(data.revenue, data.queue);
    renderQueue(data.queue);
}

function showApp(): void {
    loginSection.hidden = true;
    appSection.hidden = false;
}

async function trySignIn(key: string, remember: boolean): Promise<void> {
    adminKey = key;
    loginStatus.textContent = 'Checking…';
    loginStatus.className = 'status';
    try {
        await loadQueue();
        if (remember) localStorage.setItem(STORAGE_KEY, key);
        showApp();
    } catch (err) {
        adminKey = '';
        loginStatus.textContent = err instanceof Error ? err.message : 'Sign-in failed';
        loginStatus.className = 'status error';
    }
}

loginForm.addEventListener('submit', event => {
    event.preventDefault();
    trySignIn(keyInput.value.trim(), rememberInput.checked);
});

$('#refresh').addEventListener('click', () => { loadQueue().catch(() => undefined); });

$('#signout').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    adminKey = '';
    appSection.hidden = true;
    loginSection.hidden = false;
    keyInput.value = '';
});

adsList.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const article = button.closest<HTMLElement>('[data-id]');
    const id = article?.dataset.id;
    const action = button.dataset.action;
    if (!id || (action !== 'approve' && action !== 'reject')) return;

    button.disabled = true;
    try {
        await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action, id }) });
        await loadQueue();
    } catch (err) {
        button.disabled = false;
        alert(err instanceof Error ? err.message : 'Action failed');
    }
});

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) trySignIn(saved, true);
