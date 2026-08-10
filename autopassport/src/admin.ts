import './admin.css';
import { escapeHtml } from './escape-html';
import { safeHref, safeImageSrc } from './safe-url';

type Submission = {
    id: string; developerEmail: string; name: string; tagline: string; category: string;
    description: string; iconUrl: string; storeUrl: string;
    status: 'pending_review' | 'certified' | 'rejected'; paidAt: string | null; createdAt: string;
};
type Revenue = { paidSubmissions: number; certified: number; pendingReview: number; feeCents: number };

const CATEGORY_LABELS: Record<string, string> = {
    navigation: 'Navigation',
    music: 'Music & Audio',
    phone_messaging: 'Phone & Messaging',
    other: 'Other',
};

const STORAGE_KEY = 'autopassport_admin_key';
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

const loginSection = $('#admin-login');
const appSection = $('#admin-app');
const loginForm = $<HTMLFormElement>('#login-form');
const keyInput = $<HTMLInputElement>('#admin-key');
const rememberInput = $<HTMLInputElement>('#remember');
const loginStatus = $('#login-status');
const appStatus = $('#app-status');
const queueList = $('#queue-list');
const statsEl = $('#stats');

let adminKey = '';

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const day = (value: string | null): string => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

class AdminApiError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

async function callAdmin<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${adminKey}`,
        },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new AdminApiError(
            response.status,
            (payload as { error?: string } | null)?.error || `Request failed (${response.status})`,
        );
    }
    return payload as T;
}

function renderStats(revenue: Revenue): void {
    statsEl.innerHTML = [
        ['Gross taken', money(revenue.paidSubmissions * revenue.feeCents)],
        ['Stamped & listed', String(revenue.certified)],
        ['Awaiting review', String(revenue.pendingReview)],
    ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label!)}</span><b>${escapeHtml(value!)}</b></div>`).join('');
}

function renderQueue(items: Submission[]): void {
    queueList.innerHTML = items.length ? items.map(item => {
        const icon = safeImageSrc(item.iconUrl);
        const initial = escapeHtml(item.name.charAt(0).toUpperCase() || 'A');
        return `
      <article class="item${item.status === 'pending_review' ? ' is-pending' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="item-head">
          <span class="icon-thumb" aria-hidden="true">${initial}${icon ? `<img data-admin-icon src="${escapeHtml(icon)}" alt="" loading="lazy">` : ''}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <span class="badge ${item.status}">${item.status.replace('_', ' ')}</span>
        </div>
        <p class="meta">
          ${escapeHtml(CATEGORY_LABELS[item.category] || item.category)}
          &nbsp;·&nbsp; <a href="${escapeHtml(safeHref(item.storeUrl))}" target="_blank" rel="noopener noreferrer">app link</a>
          &nbsp;·&nbsp; <a href="mailto:${escapeHtml(item.developerEmail)}">${escapeHtml(item.developerEmail)}</a>
          &nbsp;·&nbsp; paid ${escapeHtml(day(item.paidAt))}
        </p>
        <p class="desc"><b>${escapeHtml(item.tagline)}</b><br>${escapeHtml(item.description)}</p>
        ${item.status === 'pending_review' ? `
        <div class="row">
          <button type="button" data-action="approve">Approve — stamp & list</button>
          <button type="button" class="ghost danger" data-action="reject">Reject</button>
        </div>` : ''}
      </article>`;
    }).join('') : `<div class="empty">Nothing to review yet.</div>`;

    queueList.querySelectorAll<HTMLImageElement>('img[data-admin-icon]').forEach(image => {
        image.addEventListener('error', () => image.remove(), { once: true });
    });
}

async function loadQueue(): Promise<void> {
    const data = await callAdmin<{ queue: Submission[]; revenue: Revenue }>('/api/admin');
    renderStats(data.revenue);
    renderQueue(data.queue);
}

function showApp(): void {
    loginSection.hidden = true;
    appSection.hidden = false;
}

function signOut(message = ''): void {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    adminKey = '';
    appSection.hidden = true;
    loginSection.hidden = false;
    keyInput.value = '';
    loginStatus.textContent = message;
    loginStatus.className = message ? 'status error' : 'status';
}

async function trySignIn(key: string, remember: boolean): Promise<void> {
    adminKey = key;
    loginStatus.textContent = 'Checking…';
    loginStatus.className = 'status';
    try {
        await loadQueue();
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key);
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

$('#refresh').addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    appStatus.textContent = 'Refreshing…';
    appStatus.className = 'status';
    try {
        await loadQueue();
        appStatus.textContent = 'Up to date.';
        appStatus.className = 'status success';
    } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) {
            signOut('Your admin session expired. Sign in again.');
            return;
        }
        appStatus.textContent = err instanceof Error ? err.message : 'Refresh failed';
        appStatus.className = 'status error';
    } finally {
        button.disabled = false;
    }
});

$('#signout').addEventListener('click', () => signOut());

async function onReviewClick(event: Event): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const id = button.closest<HTMLElement>('[data-id]')?.dataset.id;
    const action = button.dataset.action;
    if (!id || (action !== 'approve' && action !== 'reject')) return;
    if (action === 'reject' && !window.confirm('Reject this paid submission? This cannot be undone from the admin screen.')) return;

    const rowButtons = button.closest<HTMLElement>('[data-id]')?.querySelectorAll<HTMLButtonElement>('button') || [];
    rowButtons.forEach(item => { item.disabled = true; });
    appStatus.textContent = action === 'approve' ? 'Publishing stamp…' : 'Rejecting submission…';
    appStatus.className = 'status';
    try {
        await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action, id }) });
        await loadQueue();
        appStatus.textContent = action === 'approve' ? 'App stamped and published.' : 'Submission rejected.';
        appStatus.className = 'status success';
    } catch (err) {
        rowButtons.forEach(item => { item.disabled = false; });
        if (err instanceof AdminApiError && err.status === 401) {
            signOut('Your admin session expired. Sign in again.');
            return;
        }
        appStatus.textContent = err instanceof Error ? err.message : 'Action failed';
        appStatus.className = 'status error';
    }
}

queueList.addEventListener('click', onReviewClick);

const persistentKey = localStorage.getItem(STORAGE_KEY);
const saved = persistentKey || sessionStorage.getItem(STORAGE_KEY);
rememberInput.checked = Boolean(persistentKey);
if (saved) trySignIn(saved, Boolean(persistentKey));
