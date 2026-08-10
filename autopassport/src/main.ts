import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';
import { safeHref, safeImageSrc } from './safe-url';

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
let appRequest: AbortController | null = null;

function renderApps(apps: App[], query: string): void {
    if (!appGrid) return;

    if (!apps.length) {
        const scoped = activeCategory ? ` in ${CATEGORY_LABELS[activeCategory] || 'this category'}` : '';
        const message = query
            ? `No stamped apps match “${escapeHtml(query)}”${escapeHtml(scoped)}.`
            : `No apps stamped${escapeHtml(scoped)} yet — be the first developer to get certified.`;
        appGrid.innerHTML = `<p class="grid-empty">${message}</p>`;
        return;
    }

    appGrid.innerHTML = apps.map(app => {
        const icon = safeImageSrc(app.iconUrl);
        const initial = escapeHtml(app.name.charAt(0).toUpperCase() || 'A');
        return `<a class="app-card" href="${escapeHtml(safeHref(app.storeUrl))}" target="_blank" rel="noopener noreferrer">
        <div class="app-card-top">
            <span class="app-icon" aria-hidden="true">${initial}${icon ? `<img data-app-icon src="${escapeHtml(icon)}" alt="" loading="lazy">` : ''}</span>
            <div>
                <p class="app-title">${escapeHtml(app.name)}</p>
                <span class="app-badge">✓ Stamped</span>
            </div>
        </div>
        <p class="app-tagline">${escapeHtml(app.tagline)}</p>
        <span class="app-cat">${escapeHtml(CATEGORY_LABELS[app.category] || app.category)}</span>
    </a>`;
    }).join('');

    appGrid.querySelectorAll<HTMLImageElement>('img[data-app-icon]').forEach(image => {
        image.addEventListener('error', () => image.remove(), { once: true });
    });
}

async function loadApps(): Promise<void> {
    if (!appGrid) return;
    appRequest?.abort();
    const request = new AbortController();
    appRequest = request;
    appGrid.innerHTML = `<p class="grid-empty">Loading…</p>`;

    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    const q = search?.value.trim() || '';
    if (q) params.set('q', q);

    try {
        const response = await api.get<{ apps: App[] }>(`/api/apps?${params.toString()}`, { signal: request.signal });
        if (request.signal.aborted) return;
        renderApps(response.data.apps || [], q);
    } catch (err) {
        if (request.signal.aborted) return;
        appGrid.innerHTML = `<div class="grid-empty">The directory is unreachable right now. <button class="retry-link" type="button" data-retry-apps>Try again</button></div>`;
    } finally {
        if (appRequest === request) appRequest = null;
    }
}

tabs?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (!button) return;
    tabs.querySelectorAll<HTMLElement>('.tab').forEach(tab => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
    });
    button.classList.add('active');
    button.setAttribute('aria-selected', 'true');
    activeCategory = button.dataset.category || '';
    loadApps();
});

appGrid?.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('[data-retry-apps]')) loadApps();
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
    if (submitStatus) { submitStatus.textContent = ''; submitStatus.className = 'form-status'; }
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
