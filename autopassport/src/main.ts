import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';

type App = {
    id: string;
    name: string;
    tagline: string;
    category: string;
    iconUrl: string;
    storeUrl: string;
    certifiedAt: string;
};

/** Mirrors CATEGORIES in api/_lib/pricing.ts. */
const CATEGORY_LABELS: Record<string, string> = {
    navigation: 'Navigation',
    music: 'Music & Audio',
    phone_messaging: 'Phone & Messaging',
    other: 'Other',
};

/** Mirrors CERTIFICATION_FEE_CENTS in api/_lib/pricing.ts until the stats
 *  response confirms the live value. */
let feeCents = 4900;

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const proofTotal = $('#proof-total');
const proofFee = $('#proof-fee');
const dashGrid = $('#dash-grid');
const tabs = $('#tabs');
const search = $<HTMLInputElement>('#search');
const appGrid = $('#app-grid');
const submitForm = $<HTMLFormElement>('#submit-form');
const submitStatus = $('#submit-status');
const feeReadout = $('#fee-readout');
const noticeBox = $('#notice');

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

// The submit API already rejects non-http(s) storeUrl values before a row
// can exist, but a link rendered for every visitor is worth checking again
// here rather than trusting that no other path into this table will ever
// appear.
const safeHref = (url: string): string => {
    try {
        return ['http:', 'https:'].includes(new URL(url).protocol) ? url : '#';
    } catch {
        return '#';
    }
};

/* ---------------- the dash mock: one tile stamped at a time ---------------- */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function loopStamps(): void {
    if (!dashGrid) return;
    const tiles = Array.from(dashGrid.querySelectorAll<HTMLElement>('.tile:not(.ghost)'));
    if (!tiles.length) return;

    if (reduceMotion) {
        tiles.forEach(tile => tile.classList.add('stamped'));
        return;
    }

    let index = 0;
    const STEP_MS = 900;
    window.setInterval(() => {
        tiles[index]?.classList.add('stamped');
        index = (index + 1) % tiles.length;
        if (index === 0) tiles.forEach(tile => tile.classList.remove('stamped'));
    }, STEP_MS);
}

/* ---------------- live proof numbers ---------------- */

async function loadStats(): Promise<void> {
    try {
        const response = await api.get<{ total: number; feeCents: number }>('/api/apps?view=stats');
        if (typeof response.data.feeCents === 'number') feeCents = response.data.feeCents;
        if (proofTotal) proofTotal.textContent = response.data.total.toLocaleString();
        if (proofFee) proofFee.textContent = money(feeCents);
        if (feeReadout) feeReadout.textContent = money(feeCents);
    } catch {
        if (proofTotal) proofTotal.textContent = '0';
    }
}

/* ---------------- the directory ---------------- */

let activeCategory = '';
let searchTimer: number | undefined;

function renderApps(apps: App[]): void {
    if (!appGrid) return;

    if (!apps.length) {
        const scoped = activeCategory ? ` in ${CATEGORY_LABELS[activeCategory] || 'this category'}` : '';
        appGrid.innerHTML = `<p class="grid-empty">No apps stamped${escapeHtml(scoped)} yet — be the first developer to get certified.</p>`;
        return;
    }

    appGrid.innerHTML = apps.map(app => `<a class="app-card" href="${escapeHtml(safeHref(app.storeUrl))}" target="_blank" rel="noopener noreferrer">
        <div class="app-card-top">
            <img class="app-icon" src="${escapeHtml(app.iconUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <div>
                <p class="app-title">${escapeHtml(app.name)}</p>
                <span class="app-badge">✓ Stamped</span>
            </div>
        </div>
        <p class="app-tagline">${escapeHtml(app.tagline)}</p>
        <span class="app-cat">${escapeHtml(CATEGORY_LABELS[app.category] || app.category)}</span>
    </a>`).join('');
}

async function loadApps(): Promise<void> {
    if (!appGrid) return;
    appGrid.innerHTML = `<p class="grid-empty">Loading…</p>`;

    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    const q = search?.value.trim();
    if (q) params.set('q', q);

    try {
        const response = await api.get<{ apps: App[] }>(`/api/apps?${params.toString()}`);
        renderApps(response.data.apps || []);
    } catch {
        appGrid.innerHTML = `<p class="grid-empty">The directory is unreachable right now.</p>`;
    }
}

tabs?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (!button) return;
    tabs.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    button.classList.add('active');
    activeCategory = button.dataset.category || '';
    loadApps();
});

search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadApps, 300);
});

/* ---------------- developer submission ---------------- */

submitForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!submitForm.checkValidity()) { submitForm.reportValidity(); return; }

    const button = submitForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(submitForm).entries());

    if (button) { button.disabled = true; button.textContent = 'Starting checkout…'; }
    try {
        const response = await api.post<{ checkoutUrl?: string }>('/api/apps?action=submit', payload);
        if (response.data.checkoutUrl) {
            if (submitStatus) { submitStatus.textContent = 'Redirecting to secure checkout…'; submitStatus.className = 'form-status ok'; }
            window.location.assign(response.data.checkoutUrl);
            return;
        }
        if (submitStatus) { submitStatus.textContent = 'Checkout could not be started. Try again.'; submitStatus.className = 'form-status bad'; }
    } catch (err) {
        if (submitStatus) {
            submitStatus.textContent = err instanceof ApiError ? err.message : 'Could not start checkout. Try again.';
            submitStatus.className = 'form-status bad';
        }
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Continue to payment →'; }
    }
});

/* ---------------- returning from Stripe ---------------- */

const NOTICES: Record<'success' | 'cancelled', { tone: 'success' | 'neutral'; title: string; body: string }> = {
    success: {
        tone: 'success',
        title: 'Checkout complete.',
        body: 'Once your payment is confirmed, your app moves into the review queue — it joins the passport as soon as someone has actually driven with it.',
    },
    cancelled: {
        tone: 'neutral',
        title: 'Checkout cancelled.',
        body: 'You were not charged and nothing was submitted for review. The form is still here if you want another go.',
    },
};

function showNotice(): void {
    if (!noticeBox) return;

    const key = new URLSearchParams(window.location.search).get('submit');
    if (key !== 'success' && key !== 'cancelled') return;
    const notice = NOTICES[key];

    noticeBox.innerHTML = `<div class="notice notice-${notice.tone}">
        <p><strong>${notice.title}</strong> ${notice.body}</p>
        <button type="button" class="notice-close" aria-label="Dismiss">&times;</button>
    </div>`;
    noticeBox.querySelector('.notice-close')?.addEventListener('click', () => { noticeBox.innerHTML = ''; });

    // Drop the parameter so a refresh — or a link pasted to a friend — doesn't
    // replay "payment received" for someone who never submitted anything.
    const url = new URL(window.location.href);
    url.searchParams.delete('submit');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

showNotice();
loadStats();
loadApps();
loopStamps();
