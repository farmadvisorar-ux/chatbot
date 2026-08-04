import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';

type Rate = { headline: string; cpmCents: number; viewsRemaining: number };

/** Mirrors PUBLISHER_SHARE_PERCENT in api/_lib/pricing.ts; the board response
 *  carries the server's value so this is only the pre-load placeholder. */
let sharePercent = 40;

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const boardRows = $('#board-rows');
const proofRate = $('#proof-rate');
const proofLive = $('#proof-live');
const adForm = $<HTMLFormElement>('#ad-form');
const adStatus = $('#ad-status');
const pubForm = $<HTMLFormElement>('#pub-form');
const pubStatus = $('#pub-status');
const pubSnippet = $('#pub-snippet');
const pubEstimate = $('#pub-estimate');
const pubEstimateSide = $('#pub-estimate-side');
const cpmInput = $<HTMLInputElement>('#cpm-input');
const budgetInput = $<HTMLInputElement>('#budget-input');
const estimate = $('#views-estimate');
const estimateSide = $('#views-side');
const noticeBox = $('#notice');

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/* ---------- the live rate board ---------- */

function renderBoard(rates: Rate[]): void {
    if (!boardRows) return;

    if (!rates.length) {
        boardRows.innerHTML = `<p class="board-empty">
            No campaigns rotating yet — the first advertiser sets the opening rate.
            Anything from $1.00 to $100.00 per 1,000 views.
        </p>`;
        if (proofRate) proofRate.textContent = '—';
        if (proofLive) proofLive.textContent = '0';
        return;
    }

    boardRows.innerHTML = rates.map(rate => {
        const cut = Math.round((rate.cpmCents * sharePercent) / 100);
        return `<div class="board-row">
            <span class="board-pitch">${escapeHtml(rate.headline)}</span>
            <span class="board-rate num">${escapeHtml(money(rate.cpmCents))}</span>
            <span class="board-cut num">${escapeHtml(money(cut))}</span>
        </div>`;
    }).join('');

    // The headline rate is the top of the board, since that is what a publisher
    // stands to earn from at best — not an average that nobody is actually paying.
    const topRate = Math.max(...rates.map(r => r.cpmCents));
    if (proofRate) proofRate.textContent = money(topRate);
    if (proofLive) proofLive.textContent = String(rates.length);

    if (pubEstimate) pubEstimate.textContent = money(Math.round((topRate * sharePercent) / 100));
    if (pubEstimateSide) pubEstimateSide.textContent = `per 1,000 views, at the current top rate of ${money(topRate)}`;
}

async function loadBoard(): Promise<void> {
    try {
        const response = await api.get<{ rates: Rate[]; sharePercent: number }>('/api/ads?view=board');
        if (typeof response.data.sharePercent === 'number') sharePercent = response.data.sharePercent;
        renderBoard(response.data.rates || []);
    } catch {
        if (boardRows) boardRows.innerHTML = `<p class="board-empty">The board is unreachable right now.</p>`;
    }
}

/* ---------- advertiser lane ---------- */

function updateEstimate(): void {
    if (!estimate || !cpmInput || !budgetInput) return;
    const cpm = Number(cpmInput.value);
    const budget = Number(budgetInput.value);

    if (!(cpm > 0) || !(budget > 0)) {
        estimate.textContent = '—';
        if (estimateSide) estimateSide.textContent = 'Enter a rate and a budget';
        return;
    }
    const views = Math.floor((budget / cpm) * 1000);
    estimate.textContent = `${views.toLocaleString()} views`;
    if (estimateSide) {
        estimateSide.textContent = `${money(Math.round(budget * 100 * sharePercent / 100))} of this goes to publishers`;
    }
}

adForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!adForm.checkValidity()) { adForm.reportValidity(); return; }

    const button = adForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const raw = Object.fromEntries(new FormData(adForm).entries()) as Record<string, string>;
    const payload = {
        headline: raw.headline,
        url: raw.url,
        email: raw.email,
        cpmCents: Math.round(Number(cpmInput?.value) * 100),
        budgetCents: Math.round(Number(budgetInput?.value) * 100),
    };

    if (button) { button.disabled = true; button.textContent = 'Starting checkout…'; }
    try {
        const response = await api.post<{ checkoutUrl?: string }>('/api/ads?action=checkout', payload);
        if (response.data.checkoutUrl) {
            if (adStatus) { adStatus.textContent = 'Redirecting to secure checkout…'; adStatus.className = 'form-status ok'; }
            window.location.assign(response.data.checkoutUrl);
            return;
        }
        if (adStatus) { adStatus.textContent = 'Checkout could not be started. Try again.'; adStatus.className = 'form-status bad'; }
    } catch (err) {
        if (adStatus) {
            adStatus.textContent = err instanceof ApiError ? err.message : 'Could not start checkout. Try again.';
            adStatus.className = 'form-status bad';
        }
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Continue to payment →'; }
    }
});

cpmInput?.addEventListener('input', updateEstimate);
budgetInput?.addEventListener('input', updateEstimate);

/* ---------- publisher lane ---------- */

pubForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!pubForm.checkValidity()) { pubForm.reportValidity(); return; }

    const button = pubForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(pubForm).entries());

    if (button) { button.disabled = true; button.textContent = 'Creating your key…'; }
    try {
        const response = await api.post<{ slotKey: string; status: string }>('/api/publishers', payload);
        const { slotKey } = response.data;

        if (pubStatus) {
            pubStatus.textContent = 'Key created. It starts earning once we have checked the site.';
            pubStatus.className = 'form-status ok';
        }
        if (pubSnippet) {
            // Shown rather than emailed because the whole pitch is that nothing
            // here is hidden from the publisher.
            pubSnippet.classList.remove('is-placeholder');
            pubSnippet.textContent = `<div id="sikads"></div>
<script src="${window.location.origin}/embed.js" data-slot="${slotKey}"><\/script>`;
        }
    } catch (err) {
        if (pubStatus) {
            pubStatus.textContent = err instanceof ApiError ? err.message : 'Could not create your key. Try again.';
            pubStatus.className = 'form-status bad';
        }
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Get my slot key →'; }
    }
});

/* ---------- returning from Stripe ---------- */

const NOTICES: Record<'success' | 'cancelled', { tone: 'success' | 'neutral'; title: string; body: string }> = {
    success: {
        tone: 'success',
        title: 'Payment received.',
        body: 'Your campaign is in the review queue — it joins the board as soon as it is approved.',
    },
    cancelled: {
        tone: 'neutral',
        title: 'Checkout cancelled.',
        body: 'You were not charged and nothing went live. The form is still here if you want another go.',
    },
};

function showNotice(): void {
    if (!noticeBox) return;

    // Matched against the two known keys rather than indexing straight into
    // NOTICES, so a hand-edited ?ad=anything can't render a half-empty banner.
    const key = new URLSearchParams(window.location.search).get('ad');
    if (key !== 'success' && key !== 'cancelled') return;
    const notice = NOTICES[key];

    noticeBox.innerHTML = `<div class="notice notice-${notice.tone}">
        <p><strong>${notice.title}</strong> ${notice.body}</p>
        <button type="button" class="notice-close" aria-label="Dismiss">&times;</button>
    </div>`;
    noticeBox.querySelector('.notice-close')?.addEventListener('click', () => { noticeBox.innerHTML = ''; });

    // Drop the parameter so a refresh — or a link someone pastes to a friend —
    // doesn't replay "payment received" for a person who never bought anything.
    const url = new URL(window.location.href);
    url.searchParams.delete('ad');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

showNotice();
updateEstimate();
loadBoard();
