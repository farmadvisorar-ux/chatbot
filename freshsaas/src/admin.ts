import './admin.css';
import { escapeHtml } from './escape-html';

type Listing = {
    id: string; name: string; tagline: string; url: string; category: string;
    source: string; sourceUrl: string | null; featured: boolean; featuredRank: number;
    status: string; discoveredAt: string; submitterEmail: string | null;
};
type Release = {
    id: string; listingName: string; buyerEmail: string; sellerEmail: string;
    priceCents: number; platformFeeCents: number; sellerPayoutCents: number; paidAt: string;
};
type Overview = {
    totals: {
        live: number; featured: number; removed: number; last24h: number;
        waitlist: number; users: number; marketlistings: number; heldorders: number; feescents: number;
    };
    bySource: Array<{ source: string; count: number }>;
    lastIngest: string | null;
};

const STORAGE_KEY = 'freshsaas_admin_key';
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

const loginSection = $('#admin-login');
const appSection = $('#admin-app');
const loginForm = $<HTMLFormElement>('#login-form');
const keyInput = $<HTMLInputElement>('#admin-key');
const rememberInput = $<HTMLInputElement>('#remember');
const loginStatus = $('#login-status');
const toolsStatus = $('#tools-status');
const listingsList = $('#listings-list');
const payoutsList = $('#payouts-list');
const listingSearch = $<HTMLInputElement>('#listing-search');
const filterView = $<HTMLSelectElement>('#filter-view');
const filterSource = $<HTMLSelectElement>('#filter-source');
const statsEl = $('#stats');
const editModal = $('#edit-modal');
const editForm = $<HTMLFormElement>('#edit-form');
const editStatus = $('#edit-status');

let adminKey = '';

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const day = (value: string): string => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const ago = (value: string | null): string => {
    if (!value) return 'never';
    const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
};

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

function renderStats(data: Overview): void {
    const t = data.totals;
    const tiles: Array<[string, string, string?]> = [
        ['Live listings', String(t.live), `${t.last24h} added in 24h`],
        ['Featured', String(t.featured)],
        ['Removed', String(t.removed)],
        ['Signed-up users', String(t.users)],
        ['Waitlist', String(t.waitlist)],
        ['Marketplace', String(t.marketlistings), `${t.heldorders} held`],
        ['Fees earned', money(t.feescents)],
        ['Last ingest', ago(data.lastIngest)],
    ];
    statsEl.innerHTML = tiles.map(([label, value, sub]) => `
      <div class="stat"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>
    `).join('');

    // Keep the source filter in step with what's actually in the directory.
    const current = filterSource.value;
    filterSource.innerHTML = '<option value="">All sources</option>' +
        data.bySource.map(s => `<option value="${escapeHtml(s.source)}">${escapeHtml(s.source)} (${s.count})</option>`).join('');
    filterSource.value = current;
}

function renderListings(items: Listing[]): void {
    $('#count-listings').textContent = String(items.length);
    const removedView = filterView.value === 'removed';

    listingsList.innerHTML = items.length ? items.map(item => `
      <article class="item${item.featured ? ' is-featured' : ''}" data-id="${escapeHtml(item.id)}"
               data-name="${escapeHtml(item.name)}" data-tagline="${escapeHtml(item.tagline)}" data-category="${escapeHtml(item.category)}">
        <div class="item-head">
          <h3>${escapeHtml(item.name)}</h3>
          ${item.featured ? '<span class="badge">Featured</span>' : ''}
        </div>
        <p class="meta">${escapeHtml(item.tagline)}</p>
        <p class="meta">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
          &nbsp;·&nbsp; ${escapeHtml(item.category)} &nbsp;·&nbsp; via ${escapeHtml(item.source)}
          ${item.sourceUrl ? `&nbsp;·&nbsp; <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}
          ${item.submitterEmail ? `&nbsp;·&nbsp; <a href="mailto:${escapeHtml(item.submitterEmail)}">${escapeHtml(item.submitterEmail)}</a>` : ''}
          &nbsp;·&nbsp; ${escapeHtml(day(item.discoveredAt))}
        </p>
        <div class="row">
          ${removedView
            ? '<button type="button" data-action="restore">Restore to directory</button>'
            : `<button type="button" data-action="${item.featured ? 'unfeature' : 'feature'}">${item.featured ? 'Unfeature' : 'Feature'}</button>
               <button type="button" class="ghost" data-action="edit">Edit</button>
               <button type="button" class="ghost" data-action="unpublish">Remove</button>`}
        </div>
      </article>`).join('') : `<div class="empty">${removedView ? 'Nothing removed.' : 'No listings match.'}</div>`;
}

function renderPayouts(items: Release[]): void {
    $('#count-payouts').textContent = String(items.length);
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
    const params = new URLSearchParams({
        view: 'listings',
        q: listingSearch.value.trim(),
        filter: filterView.value,
        source: filterSource.value,
    });
    const [overview, live, rels] = await Promise.all([
        callAdmin<Overview>('/api/admin?view=overview'),
        callAdmin<{ listings: Listing[] }>(`/api/admin?${params}`),
        callAdmin<{ awaitingRelease: Release[] }>('/api/admin?view=releases'),
    ]);
    renderStats(overview);
    renderListings(live.listings ?? []);
    renderPayouts(rels.awaitingRelease ?? []);
}

async function signIn(key: string, remember: boolean): Promise<void> {
    adminKey = key;
    // Only stored once the API has accepted it, so a wrong key never persists.
    await loadAll();
    if (remember) localStorage.setItem(STORAGE_KEY, key);
    loginSection.hidden = true;
    appSection.hidden = false;
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

$('#signout').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    adminKey = '';
    appSection.hidden = true;
    loginSection.hidden = false;
    keyInput.value = '';
});

$('#refresh').addEventListener('click', () => { void loadAll(); });

document.querySelectorAll<HTMLButtonElement>('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(other => other.classList.toggle('active', other === tab));
    document.querySelectorAll<HTMLElement>('.panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
    });
}));

listingsList.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    const card = button?.closest<HTMLElement>('.item');
    const id = card?.dataset.id;
    if (!button || !id || !card) return;
    const action = button.dataset.action!;

    if (action === 'edit') {
        // Read from data attributes rather than rendered text: the visible
        // markup wraps values in links and separators, so scraping it back out
        // returns the decorated version rather than the stored one.
        (editForm.elements.namedItem('id') as HTMLInputElement).value = id;
        (editForm.elements.namedItem('name') as HTMLInputElement).value = card.dataset.name ?? '';
        (editForm.elements.namedItem('tagline') as HTMLInputElement).value = card.dataset.tagline ?? '';
        (editForm.elements.namedItem('category') as HTMLInputElement).value = card.dataset.category ?? '';
        editStatus.textContent = '';
        editModal.hidden = false;
        return;
    }
    if (action === 'unpublish' && !confirm('Remove this listing? It will stop appearing on the site and will not be re-added by a later ingest.')) return;

    button.disabled = true;
    try {
        await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ id, action }) });
        await loadAll();
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Action failed');
        button.disabled = false;
    }
});

editForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(editForm).entries());
    const button = editForm.querySelector('button')!;
    button.disabled = true;
    editStatus.textContent = 'Saving…';
    editStatus.className = 'status';
    try {
        await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ ...data, action: 'edit' }) });
        editModal.hidden = true;
        await loadAll();
    } catch (err) {
        editStatus.textContent = err instanceof Error ? err.message : 'Save failed';
        editStatus.className = 'status error';
    } finally {
        button.disabled = false;
    }
});
document.querySelectorAll('[data-close-edit]').forEach(el =>
    el.addEventListener('click', () => { editModal.hidden = true; }));

payoutsList.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="release"]');
    const id = button?.closest<HTMLElement>('.item')?.dataset.id;
    if (!button || !id) return;
    // Moves real money and can't be reversed here, so it needs a deliberate yes.
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
        // Proxied through the admin API so CRON_SECRET stays out of the browser.
        const result = await callAdmin<{ totalAdded?: number; sent?: number }>('/api/admin', {
            method: 'POST',
            body: JSON.stringify({ action: task === 'ingest' ? 'run-ingest' : 'run-digest' }),
        });
        toolsStatus.textContent = task === 'ingest'
            ? `Added ${result.totalAdded ?? 0} new launches.`
            : `Sent a digest of ${result.sent ?? 0} launches.`;
        toolsStatus.className = 'status success';
        await loadAll();
    } catch (err) {
        toolsStatus.textContent = err instanceof Error ? err.message : 'Task failed';
        toolsStatus.className = 'status error';
    } finally {
        button.disabled = false;
    }
}

$<HTMLButtonElement>('#run-ingest').addEventListener('click', e => void runTask('ingest', e.currentTarget as HTMLButtonElement));
$<HTMLButtonElement>('#run-digest').addEventListener('click', e => void runTask('digest', e.currentTarget as HTMLButtonElement));

let searchTimer = 0;
listingSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { void loadAll(); }, 300);
});
filterView.addEventListener('change', () => { void loadAll(); });
filterSource.addEventListener('change', () => { void loadAll(); });

const stored = localStorage.getItem(STORAGE_KEY);
if (stored) {
    signIn(stored, true).catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        adminKey = '';
    });
}
