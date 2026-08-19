import './admin.css';
import { escapeHtml } from './escape-html';

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
const queueList = $('#queue-list');
const statsEl = $('#stats');

let adminKey = '';

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
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

function renderStats(revenue: Revenue): void {
    statsEl.innerHTML = [
        ['Gross taken', money(revenue.paidSubmissions * revenue.feeCents)],
        ['Stamped & listed', String(revenue.certified)],
        ['Awaiting review', String(revenue.pendingReview)],
    ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label!)}</span><b>${escapeHtml(value!)}</b></div>`).join('');
}

function renderQueue(items: Submission[]): void {
    queueList.innerHTML = items.length ? items.map(item => `
      <article class="item${item.status === 'pending_review' ? ' is-pending' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="item-head">
          <img class="icon-thumb" src="${escapeHtml(item.iconUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="badge ${item.status}">${item.status.replace('_', ' ')}</span>
        </div>
        <p class="meta">
          ${escapeHtml(CATEGORY_LABELS[item.category] || item.category)}
          &nbsp;·&nbsp; <a href="${escapeHtml(item.storeUrl)}" target="_blank" rel="noopener noreferrer">app link</a>
          &nbsp;·&nbsp; <a href="mailto:${escapeHtml(item.developerEmail)}">${escapeHtml(item.developerEmail)}</a>
          &nbsp;·&nbsp; paid ${escapeHtml(day(item.paidAt))}
        </p>
        <p class="desc"><b>${escapeHtml(item.tagline)}</b><br>${escapeHtml(item.description)}</p>
        ${item.status === 'pending_review' ? `
        <div class="row">
          <button type="button" data-action="approve">Approve — stamp & list</button>
          <button type="button" class="ghost danger" data-action="reject">Reject</button>
        </div>` : ''}
      </article>`).join('') : `<div class="empty">Nothing to review yet.</div>`;
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

async function onReviewClick(event: Event): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const id = button.closest<HTMLElement>('[data-id]')?.dataset.id;
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
}

queueList.addEventListener('click', onReviewClick);

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) trySignIn(saved, true);
