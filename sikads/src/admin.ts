import './admin.css';
import { escapeHtml } from './escape-html';

type Campaign = {
    id: string; advertiserEmail: string; headline: string; url: string;
    cpmCents: number; budgetCents: number; viewsPurchased: number; viewsRemaining: number;
    status: 'pending_review' | 'live' | 'rejected' | 'exhausted'; paidAt: string | null; createdAt: string;
};
type Publisher = {
    id: string; email: string; siteUrl: string; slotKey: string;
    status: 'pending_review' | 'active' | 'rejected';
    viewsServed: string | number; owedMicrocents: string | number; earnedMicrocents: string | number;
    createdAt: string;
};
// pg returns bigint as a string to avoid silently truncating past 2^53, so
// every total that came from a bigint column arrives here as text.
type Revenue = { grossCents: string | number; campaigns: number; owedMicrocents: string | number };

const STORAGE_KEY = 'sikads_admin_key';
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

const loginSection = $('#admin-login');
const appSection = $('#admin-app');
const loginForm = $<HTMLFormElement>('#login-form');
const keyInput = $<HTMLInputElement>('#admin-key');
const rememberInput = $<HTMLInputElement>('#remember');
const loginStatus = $('#login-status');
const adsList = $('#ads-list');
const publishersList = $('#publishers-list');
const statsEl = $('#stats');

let adminKey = '';

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const perThousand = (cents: number): string => `${money(cents)}/1,000`;
// Earnings accrue in microcents (1 cent = 1,000), so they only become real
// money at whole cents — anything below that is rounded down, never up.
const microMoney = (microcents: string | number): string => money(Math.floor(Number(microcents) / 1000));
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

function renderStats(revenue: Revenue, queue: Campaign[], publishers: Publisher[]): void {
    const pending = queue.filter(c => c.status === 'pending_review').length
        + publishers.filter(p => p.status === 'pending_review').length;
    const gross = Number(revenue.grossCents);
    const owedCents = Math.floor(Number(revenue.owedMicrocents) / 1000);
    statsEl.innerHTML = [
        ['Gross taken', money(gross)],
        ['Owed to publishers', money(owedCents)],
        ['Yours to keep', money(gross - owedCents)],
        ['Campaigns', String(revenue.campaigns)],
        ['Live now', String(queue.filter(c => c.status === 'live').length)],
        ['Awaiting review', String(pending)],
    ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label!)}</span><b>${escapeHtml(value!)}</b></div>`).join('');
}

function renderPublishers(items: Publisher[]): void {
    $('#count-publishers').textContent = String(items.length);
    publishersList.innerHTML = items.length ? items.map(item => `
      <article class="item${item.status === 'pending_review' ? ' is-pending' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="item-head">
          <h3>${escapeHtml(item.email)}</h3>
          <span class="badge ${item.status === 'active' ? 'live' : item.status === 'rejected' ? 'rejected' : 'pending'}">${item.status.replace('_', ' ')}</span>
        </div>
        <p class="meta">
          <a href="${escapeHtml(item.siteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.siteUrl)}</a>
          &nbsp;·&nbsp; <span class="slotkey">${escapeHtml(item.slotKey)}</span>
          &nbsp;·&nbsp; joined ${escapeHtml(day(item.createdAt))}
        </p>
        <div class="amounts">
          <div><b>${escapeHtml(Number(item.viewsServed).toLocaleString())}</b>views served</div>
          <div><b>${escapeHtml(microMoney(item.earnedMicrocents))}</b>earned all time</div>
          <div><b>${escapeHtml(microMoney(item.owedMicrocents))}</b>owed now</div>
        </div>
        <div class="row">
          ${item.status === 'pending_review'
            ? `<button type="button" data-action="publisher-approve">Approve — start earning</button>
               <button type="button" class="ghost danger" data-action="publisher-reject">Reject</button>`
            : ''}
          ${item.status === 'active' && Number(item.owedMicrocents) >= 1000
            ? `<button type="button" class="ghost" data-action="publisher-settle">Mark ${escapeHtml(microMoney(item.owedMicrocents))} as paid</button>`
            : ''}
        </div>
      </article>`).join('') : `<div class="empty">No publishers yet.</div>`;
}

function renderQueue(items: Campaign[]): void {
    $('#count-ads').textContent = String(items.length);
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
    const data = await callAdmin<{ queue: Campaign[]; revenue: Revenue; publishers: Publisher[] }>('/api/admin');
    renderStats(data.revenue, data.queue, data.publishers);
    renderQueue(data.queue);
    renderPublishers(data.publishers);
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

const ACTIONS = ['approve', 'reject', 'publisher-approve', 'publisher-reject', 'publisher-settle'];

async function onReviewClick(event: Event): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const id = button.closest<HTMLElement>('[data-id]')?.dataset.id;
    const action = button.dataset.action;
    if (!id || !action || !ACTIONS.includes(action)) return;

    // Settling records money as already sent, and there is no undo — the only
    // way back is editing the database by hand.
    if (action === 'publisher-settle' && !confirm('Only do this once the payout has actually been sent. Mark it paid?')) return;

    button.disabled = true;
    try {
        await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action, id }) });
        await loadQueue();
    } catch (err) {
        button.disabled = false;
        alert(err instanceof Error ? err.message : 'Action failed');
    }
}

adsList.addEventListener('click', onReviewClick);
publishersList.addEventListener('click', onReviewClick);

document.querySelector('.tabs')?.addEventListener('click', event => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.toggle('active', (panel as HTMLElement).dataset.panel === tab.dataset.tab);
    });
});

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) trySignIn(saved, true);
