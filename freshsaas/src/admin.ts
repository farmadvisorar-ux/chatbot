import './admin.css';
import { escapeHtml } from './escape-html';

type Listing = {
    id: string; name: string; tagline: string; url: string; category: string;
    source: string; sourceUrl: string | null; featured: boolean; featuredRank: number;
    status: string; discoveredAt: string; submitterEmail: string | null;
    contactEmail: string | null; contactKind: string | null;
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
        ${item.contactEmail ? `<p class="contact"><a href="mailto:${escapeHtml(item.contactEmail)}">${escapeHtml(item.contactEmail)}</a>${item.contactKind === 'personal' ? ' <em>personal address — write individually</em>' : ' <em>published on their site</em>'}</p>` : ''}
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

type MarketListing = {
    id: string; name: string; tagline: string; description: string; url: string; priceCents: number;
    sellerEmail: string; status: string; createdAt: string; payoutsEnabled: boolean | null;
    hasStripe: boolean | null; orders: number;
};
type Person = { id: string; email: string; name: string | null; createdAt: string; payoutsEnabled: boolean; listings: number; purchases: number };
type WaitlistRow = { email: string; source: string; createdAt: string };

function renderMarketplace(items: MarketListing[]): void {
    const pending = items.filter(item => item.status === 'pending_review').length;
    $('#count-marketplace').textContent = String(pending);
    $('#marketplace-list').innerHTML = items.length ? items.map(item => `
      <article class="item${item.status === 'pending_review' ? ' is-pending' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="item-head">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="badge ${item.status === 'live' ? 'ok' : 'warn-badge'}">${escapeHtml(item.status === 'live' ? 'Live' : 'Pending review')}</span>
        </div>
        <p class="meta">${escapeHtml(item.tagline)}</p>
        <p class="meta">
          <strong>${escapeHtml(money(item.priceCents))}</strong>
          &nbsp;·&nbsp; you keep ${escapeHtml(money(Math.round(item.priceCents * 0.1)))}
          &nbsp;·&nbsp; <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
          &nbsp;·&nbsp; <a href="mailto:${escapeHtml(item.sellerEmail)}">${escapeHtml(item.sellerEmail)}</a>
          &nbsp;·&nbsp; ${escapeHtml(day(item.createdAt))}
        </p>
        ${item.payoutsEnabled
            ? ''
            : `<div class="warn">Seller can't receive money yet${item.hasStripe ? ' — Stripe onboarding started but unfinished.' : ' — they haven\'t started payout setup.'} Buyers are blocked from purchasing until they do.</div>`}
        <div class="row">
          ${item.status === 'pending_review'
            ? '<button type="button" data-action="listing-approve">Approve for sale</button><button type="button" class="ghost" data-action="listing-reject">Reject</button>'
            : '<button type="button" class="ghost" data-action="listing-reject">Take down</button>'}
        </div>
      </article>`).join('') : '<div class="empty">No marketplace listings yet.</div>';
}

function renderPeople(users: Person[], waitlist: WaitlistRow[]): void {
    $('#count-people').textContent = String(users.length);
    $('#users-list').innerHTML = users.length ? users.map(person => `
      <article class="item">
        <h3>${escapeHtml(person.name || person.email)}</h3>
        <p class="meta">
          <a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a>
          &nbsp;·&nbsp; joined ${escapeHtml(day(person.createdAt))}
          ${person.listings ? `&nbsp;·&nbsp; ${person.listings} listing${person.listings === 1 ? '' : 's'}` : ''}
          ${person.purchases ? `&nbsp;·&nbsp; ${person.purchases} purchase${person.purchases === 1 ? '' : 's'}` : ''}
          ${person.payoutsEnabled ? '&nbsp;·&nbsp; payouts active' : ''}
        </p>
      </article>`).join('') : '<div class="empty">No signed-up accounts yet.</div>';

    $('#waitlist-list').innerHTML = waitlist.length ? waitlist.map(row => `
      <article class="item"><p class="meta"><a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a> &nbsp;·&nbsp; ${escapeHtml(day(row.createdAt))}</p></article>
    `).join('') : '<div class="empty">Nobody on the waitlist yet.</div>';
}

type Analytics = {
    days: number;
    totals: { events: number; visitors: number; pageviews: number; outbound: number };
    daily: Array<{ day: string; visitors: number; pageviews: number }>;
    referrers: Array<{ source: string; visitors: number }>;
    countries: Array<{ country: string; visitors: number }>;
    devices: Array<{ device: string; visitors: number }>;
    topListings: Array<{ label: string; clicks: number }>;
    searches: Array<{ term: string; searches: number }>;
    pages: Array<{ path: string; views: number }>;
};

/** Horizontal bars scaled to the largest value in the set. */
function bars(rows: Array<[string, number]>, emptyText: string): string {
    if (!rows.length) return `<div class="empty small">${escapeHtml(emptyText)}</div>`;
    const max = Math.max(...rows.map(([, value]) => value)) || 1;
    return rows.map(([label, value]) => `
      <div class="bar">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Math.round((value / max) * 100))}%"></span></span>
        <span class="bar-value">${value}</span>
      </div>`).join('');
}

function renderAnalytics(data: Analytics): void {
    const t = data.totals;
    $('#analytics-stats').innerHTML = [
        ['Visitors', String(t.visitors)],
        ['Pageviews', String(t.pageviews)],
        ['Outbound clicks', String(t.outbound)],
        ['Events', String(t.events)],
    ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');

    const max = Math.max(1, ...data.daily.map(d => d.visitors));
    $('#analytics-chart').innerHTML = data.daily.length
        ? data.daily.map(d => `<span class="col" title="${escapeHtml(d.day)}: ${d.visitors} visitors"><span style="height:${Math.max(2, Math.round((d.visitors / max) * 100))}%"></span></span>`).join('')
        : '<div class="empty small">No traffic recorded yet.</div>';

    $('#an-referrers').innerHTML = bars(data.referrers.map(r => [r.source, r.visitors]), 'No referrers yet.');
    $('#an-countries').innerHTML = bars(data.countries.map(r => [r.country, r.visitors]), 'No country data yet.');
    $('#an-listings').innerHTML = bars(data.topListings.map(r => [r.label, r.clicks]), 'No launch clicks yet.');
    $('#an-searches').innerHTML = bars(data.searches.map(r => [r.term, r.searches]), 'No searches yet.');
    $('#an-devices').innerHTML = bars(data.devices.map(r => [r.device, r.visitors]), 'No device data yet.');
    $('#an-pages').innerHTML = bars(data.pages.map(r => [r.path, r.views]), 'No pageviews yet.');
}

type InsightLink = { name: string; url: string; note?: string; affiliateUrl?: string | null };
type Insight = {
    slug: string; title: string; keyword: string; category: string;
    links: InsightLink[]; published: boolean; updatedAt: string;
};

let insights: Insight[] = [];

function renderInsights(): void {
    const query = $<HTMLInputElement>('#insight-search').value.trim().toLowerCase();
    const visible = insights.filter(article =>
        !query || [article.title, article.keyword, article.category, ...article.links.map(l => l.name)]
            .join(' ').toLowerCase().includes(query));

    const monetised = insights.reduce((sum, a) => sum + a.links.filter(l => l.affiliateUrl).length, 0);
    $('#count-insights').textContent = String(insights.length);

    $('#insights-list').innerHTML = visible.length ? visible.map(article => `
        <div class="item${article.published ? '' : ' is-pending'}">
            <div class="item-head">
                <h3>${escapeHtml(article.title)}</h3>
                ${article.published ? '' : '<span class="badge warn-badge">Unpublished</span>'}
                ${article.links.some(l => l.affiliateUrl) ? '<span class="badge ok">Earning</span>' : ''}
            </div>
            <p class="meta">Keyword: ${escapeHtml(article.keyword)} · ${escapeHtml(article.category)} ·
               <a href="/insights.html#${escapeHtml(article.slug)}" target="_blank" rel="noopener">View article</a></p>
            <div class="aff-rows">
                ${article.links.map(link => `
                    <div class="aff-row">
                        <div class="aff-name">
                            <strong>${escapeHtml(link.name)}</strong>
                            <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.url)}</a>
                        </div>
                        <input type="url" placeholder="https://your-affiliate-link…"
                               value="${escapeHtml(link.affiliateUrl || '')}"
                               data-aff-slug="${escapeHtml(article.slug)}"
                               data-aff-link="${escapeHtml(link.name)}">
                        <button type="button" class="ghost" data-aff-save="${escapeHtml(article.slug)}"
                                data-aff-name="${escapeHtml(link.name)}">Save</button>
                    </div>`).join('')}
            </div>
            <div class="row">
                <button type="button" class="ghost"
                        data-insight-toggle="${escapeHtml(article.slug)}"
                        data-insight-action="${article.published ? 'insight-unpublish' : 'insight-publish'}">
                    ${article.published ? 'Unpublish' : 'Publish'}
                </button>
            </div>
        </div>`).join('')
        : '<div class="empty">No guides match that search.</div>';

    $('#insights-status').textContent = monetised
        ? `${monetised} affiliate link${monetised === 1 ? '' : 's'} live across ${insights.length} guides.`
        : 'No affiliate links set yet. Paste one against any tool above to start earning from it.';
    $('#insights-status').className = 'status';
}

async function loadAll(): Promise<void> {
    const params = new URLSearchParams({
        view: 'listings',
        q: listingSearch.value.trim(),
        filter: filterView.value,
        source: filterSource.value,
    });
    const days = $<HTMLSelectElement>('#analytics-days').value || '30';
    const [overview, live, rels, market, people, analytics, guides] = await Promise.all([
        callAdmin<Overview>('/api/admin?view=overview'),
        callAdmin<{ listings: Listing[] }>(`/api/admin?${params}`),
        callAdmin<{ awaitingRelease: Release[] }>('/api/admin?view=releases'),
        callAdmin<{ marketplace: MarketListing[] }>('/api/admin?view=marketplace'),
        callAdmin<{ users: Person[]; waitlist: WaitlistRow[] }>('/api/admin?view=people'),
        callAdmin<Analytics>(`/api/admin?view=analytics&days=${days}`),
        callAdmin<{ insights: Insight[] }>('/api/admin?view=insights'),
    ]);
    insights = guides.insights ?? [];
    renderInsights();
    renderAnalytics(analytics);
    renderStats(overview);
    renderListings(live.listings ?? []);
    renderPayouts(rels.awaitingRelease ?? []);
    renderMarketplace(market.marketplace ?? []);
    renderPeople(people.users ?? [], people.waitlist ?? []);
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

$('#marketplace-list').addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    const id = button?.closest<HTMLElement>('.item')?.dataset.id;
    if (!button || !id) return;
    const action = button.dataset.action!;
    if (action === 'listing-reject' && !confirm('Take this listing down? It will no longer be purchasable.')) return;

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

async function runTask(task: 'ingest' | 'digest' | 'contacts', button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    toolsStatus.textContent = { ingest: 'Pulling new launches…', digest: 'Sending digest…', contacts: 'Looking up contact addresses…' }[task];
    toolsStatus.className = 'status';
    try {
        // Proxied through the admin API so CRON_SECRET stays out of the browser.
        const result = await callAdmin<{ totalAdded?: number; sent?: number; checked?: number; found?: number }>('/api/admin', {
            method: 'POST',
            body: JSON.stringify({ action: `run-${task}` }),
        });
        toolsStatus.textContent = task === 'ingest'
            ? `Added ${result.totalAdded ?? 0} new launches.`
            : task === 'contacts'
                ? `Checked ${result.checked ?? 0} sites, found ${result.found ?? 0} contact addresses.`
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
$<HTMLButtonElement>('#run-contacts').addEventListener('click', e => void runTask('contacts', e.currentTarget as HTMLButtonElement));

let searchTimer = 0;
listingSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { void loadAll(); }, 300);
});
filterView.addEventListener('change', () => { void loadAll(); });
filterSource.addEventListener('change', () => { void loadAll(); });
$('#analytics-days').addEventListener('change', () => { void loadAll(); });

const stored = localStorage.getItem(STORAGE_KEY);
if (stored) {
    signIn(stored, true).catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        adminKey = '';
    });
}

/* Insights: affiliate links and publish state ------------------------- */
$('#insight-search').addEventListener('input', renderInsights);

$('#insights-list').addEventListener('click', async event => {
    const target = event.target as HTMLElement;

    const save = target.closest<HTMLButtonElement>('[data-aff-save]');
    if (save) {
        const slug = save.dataset.affSave!;
        const linkName = save.dataset.affName!;
        const input = $('#insights-list').querySelector<HTMLInputElement>(
            `input[data-aff-slug="${CSS.escape(slug)}"][data-aff-link="${CSS.escape(linkName)}"]`);
        if (!input) return;

        save.disabled = true;
        const original = save.textContent;
        save.textContent = 'Saving…';
        try {
            await callAdmin('/api/admin', {
                method: 'POST',
                body: JSON.stringify({ action: 'insight-affiliate', slug, linkName, affiliateUrl: input.value.trim() }),
            });
            // Update in place so the "Earning" badge and the counter stay
            // truthful without refetching every guide.
            const article = insights.find(a => a.slug === slug);
            const link = article?.links.find(l => l.name === linkName);
            if (link) link.affiliateUrl = input.value.trim() || null;
            renderInsights();
            $('#insights-status').textContent = input.value.trim()
                ? `Affiliate link saved for ${linkName}.`
                : `Affiliate link cleared for ${linkName}.`;
            $('#insights-status').className = 'status success';
        } catch (err) {
            $('#insights-status').textContent = err instanceof Error ? err.message : 'Could not save that link.';
            $('#insights-status').className = 'status error';
            save.disabled = false;
            save.textContent = original;
        }
        return;
    }

    const toggle = target.closest<HTMLButtonElement>('[data-insight-toggle]');
    if (toggle) {
        const slug = toggle.dataset.insightToggle!;
        const action = toggle.dataset.insightAction!;
        toggle.disabled = true;
        try {
            await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action, slug }) });
            const article = insights.find(a => a.slug === slug);
            if (article) article.published = action === 'insight-publish';
            renderInsights();
        } catch (err) {
            $('#insights-status').textContent = err instanceof Error ? err.message : 'Could not update that guide.';
            $('#insights-status').className = 'status error';
            toggle.disabled = false;
        }
    }
});
