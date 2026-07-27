import './admin.css';
import { escapeHtml } from './escape-html';

type Submission = { id: string; product: string; url: string; promise: string; email: string; submittedAt: string };
type Release = {
    id: string; listingName: string; buyerEmail: string; sellerEmail: string;
    priceCents: number; platformFeeCents: number; sellerPayoutCents: number; paidAt: string;
};

const STORAGE_KEY = 'freshsaas_admin_key';

const loginSection = document.querySelector<HTMLElement>('#admin-login')!;
const appSection = document.querySelector<HTMLElement>('#admin-app')!;
const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
const keyInput = document.querySelector<HTMLInputElement>('#admin-key')!;
const rememberInput = document.querySelector<HTMLInputElement>('#remember')!;
const loginStatus = document.querySelector<HTMLElement>('#login-status')!;
const toolsStatus = document.querySelector<HTMLElement>('#tools-status')!;
const submissionsList = document.querySelector<HTMLElement>('#submissions-list')!;
const payoutsList = document.querySelector<HTMLElement>('#payouts-list')!;

let adminKey = '';

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const day = (value: string): string => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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

function renderSubmissions(items: Submission[]): void {
    document.querySelector('#count-submissions')!.textContent = String(items.length);
    submissionsList.innerHTML = items.length ? items.map(item => `
      <article class="item" data-id="${escapeHtml(item.id)}">
        <h3>${escapeHtml(item.product)}</h3>
        <p class="meta">${escapeHtml(item.promise)}</p>
        <p class="meta">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
          &nbsp;·&nbsp; <a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a>
          &nbsp;·&nbsp; submitted ${escapeHtml(day(item.submittedAt))}
        </p>
        <div class="row">
          <button type="button" data-action="approve">Approve &amp; publish</button>
          <button type="button" class="ghost" data-action="reject">Reject</button>
        </div>
      </article>`).join('') : '<div class="empty">No submissions waiting.</div>';
}

function renderPayouts(items: Release[]): void {
    document.querySelector('#count-payouts')!.textContent = String(items.length);
    payoutsList.innerHTML = items.length ? items.map(item => `
      <article class="item" data-id="${escapeHtml(item.id)}">
        <h3>${escapeHtml(item.listingName)}</h3>
        <p class="meta">Buyer ${escapeHtml(item.buyerEmail)} · Seller ${escapeHtml(item.sellerEmail)} · paid ${escapeHtml(day(item.paidAt))}</p>
        <div class="amounts">
          <span>Buyer paid<b>${escapeHtml(money(item.priceCents))}</b></span>
          <span>Your fee<b>${escapeHtml(money(item.platformFeeCents))}</b></span>
          <span>Seller gets<b>${escapeHtml(money(item.sellerPayoutCents))}</b></span>
        </div>
        <div class="warn">Only release once the buyer confirms the handover is complete. This moves real money and cannot be undone here.</div>
        <div class="row"><button type="button" class="danger" data-action="release">Release ${escapeHtml(money(item.sellerPayoutCents))} to seller</button></div>
      </article>`).join('') : '<div class="empty">No payments awaiting release.</div>';
}

async function loadAll(): Promise<void> {
    const [subs, rels] = await Promise.all([
        callAdmin<{ submissions: Submission[] }>('/api/admin?view=submissions'),
        callAdmin<{ awaitingRelease: Release[] }>('/api/admin?view=releases'),
    ]);
    renderSubmissions(subs.submissions ?? []);
    renderPayouts(rels.awaitingRelease ?? []);
}

function showApp(): void {
    loginSection.hidden = true;
    appSection.hidden = false;
}

async function signIn(key: string, remember: boolean): Promise<void> {
    adminKey = key;
    // The key is only accepted once the API has actually validated it, so a
    // wrong key never gets stored.
    await loadAll();
    if (remember) localStorage.setItem(STORAGE_KEY, key);
    showApp();
}

loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = loginForm.querySelector('button')!;
    button.disabled = true;
    loginStatus.textContent = 'Checking…';
    loginStatus.className = 'status';
    try {
        await signIn(keyInput.value.trim(), rememberInput.checked);
        loginStatus.textContent = '';
    } catch (err) {
        adminKey = '';
        loginStatus.textContent = err instanceof Error ? err.message : 'Could not sign in.';
        loginStatus.className = 'status error';
    } finally {
        button.disabled = false;
    }
});

document.querySelector('#signout')!.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    adminKey = '';
    appSection.hidden = true;
    loginSection.hidden = false;
    keyInput.value = '';
});

document.querySelector('#refresh')!.addEventListener('click', () => { void loadAll(); });

document.querySelectorAll<HTMLButtonElement>('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(other => other.classList.toggle('active', other === tab));
    document.querySelectorAll<HTMLElement>('.panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
    });
}));

submissionsList.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    const id = button?.closest<HTMLElement>('.item')?.dataset.id;
    if (!button || !id) return;
    const action = button.dataset.action;
    if (action === 'reject' && !confirm('Reject this submission? It will not be published.')) return;

    button.disabled = true;
    try {
        await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ id, action }) });
        await loadAll();
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Action failed');
        button.disabled = false;
    }
});

payoutsList.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="release"]');
    const id = button?.closest<HTMLElement>('.item')?.dataset.id;
    if (!button || !id) return;
    // Releasing moves real money and can't be reversed from here, so it takes
    // an explicit confirmation rather than a single stray tap.
    if (!confirm('Release funds to the seller? Only do this once the handover is confirmed. This cannot be undone.')) return;

    button.disabled = true;
    try {
        const result = await callAdmin<{ transferId?: string }>('/api/admin', {
            method: 'POST',
            body: JSON.stringify({ orderId: id, action: 'release' }),
        });
        alert(`Released. Stripe transfer: ${result.transferId ?? 'created'}`);
        await loadAll();
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Release failed');
        button.disabled = false;
    }
});

async function runTask(task: 'ingest' | 'digest', button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    toolsStatus.textContent = task === 'ingest' ? 'Pulling new launches…' : 'Sending digest…';
    toolsStatus.className = 'status';
    try {
        // The cron endpoint takes CRON_SECRET, not the admin key, so this is
        // proxied through the admin API rather than called directly.
        const result = await callAdmin<{ totalAdded?: number; sent?: number }>(`/api/admin`, {
            method: 'POST',
            body: JSON.stringify({ action: task === 'ingest' ? 'run-ingest' : 'run-digest' }),
        });
        toolsStatus.textContent = task === 'ingest'
            ? `Added ${result.totalAdded ?? 0} new launches.`
            : `Sent a digest of ${result.sent ?? 0} launches.`;
        toolsStatus.className = 'status success';
    } catch (err) {
        toolsStatus.textContent = err instanceof Error ? err.message : 'Task failed';
        toolsStatus.className = 'status error';
    } finally {
        button.disabled = false;
    }
}

document.querySelector<HTMLButtonElement>('#run-ingest')!
    .addEventListener('click', event => void runTask('ingest', event.currentTarget as HTMLButtonElement));
document.querySelector<HTMLButtonElement>('#run-digest')!
    .addEventListener('click', event => void runTask('digest', event.currentTarget as HTMLButtonElement));

// Restore a remembered session, falling back to the login form if the stored
// key has since been rotated.
const stored = localStorage.getItem(STORAGE_KEY);
if (stored) {
    signIn(stored, true).catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        adminKey = '';
    });
}
