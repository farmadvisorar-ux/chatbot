import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';

type Ad = { id: string; headline: string; url: string };

const slot = document.querySelector<HTMLElement>('#sponsored-slot');
const form = document.querySelector<HTMLFormElement>('#ad-form');
const status = document.querySelector<HTMLElement>('#ad-status');
const cpmInput = document.querySelector<HTMLInputElement>('#cpm-input');
const budgetInput = document.querySelector<HTMLInputElement>('#budget-input');
const estimate = document.querySelector<HTMLElement>('#views-estimate');

function renderAd(ad: Ad | null): void {
    if (!slot) return;
    slot.innerHTML = ad
        ? `<a class="sponsored-card" href="${escapeHtml(ad.url)}" target="_blank" rel="noopener sponsored">
               <span class="sponsored-tag">Sponsored</span>
               <span class="sponsored-text">${escapeHtml(ad.headline)}</span>
               <span class="sponsored-arrow">→</span>
           </a>`
        : `<p class="sponsored-empty">This spot is open — be the first sponsor.</p>`;
}

async function loadSponsoredSlot(): Promise<void> {
    try {
        // GET also counts as one view of whatever ad it returns — the balance
        // decrements the moment the slot is actually shown to someone.
        const response = await api.get<{ ad: Ad | null }>('/api/ads');
        renderAd(response.data.ad);
    } catch {
        if (slot) slot.innerHTML = `<p class="sponsored-empty">Sponsored slot could not be loaded.</p>`;
    }
}

/**
 * Stripe sends the advertiser back to /?ad=success or /?ad=cancelled. Without
 * this they'd land on the plain homepage with no sign their payment landed,
 * which reads like the money vanished.
 */
const NOTICES: Record<'success' | 'cancelled', { tone: 'success' | 'neutral'; title: string; body: string }> = {
    success: {
        tone: 'success',
        title: 'Payment received.',
        body: 'Your campaign is in the review queue — it starts rotating in the Sponsored slot as soon as it is approved.',
    },
    cancelled: {
        tone: 'neutral',
        title: 'Checkout cancelled.',
        body: 'You were not charged and nothing went live. The form below is still here if you want another go.',
    },
};

function showNotice(): void {
    const container = document.querySelector<HTMLElement>('#notice');
    if (!container) return;

    // Matched against the two known keys rather than indexing straight into
    // NOTICES, so a hand-edited ?ad=anything can't render a half-empty banner.
    const key = new URLSearchParams(window.location.search).get('ad');
    if (key !== 'success' && key !== 'cancelled') return;
    const notice = NOTICES[key];

    container.innerHTML = `<div class="notice notice-${notice.tone}">
        <p><strong>${notice.title}</strong> ${notice.body}</p>
        <button type="button" class="notice-close" aria-label="Dismiss">&times;</button>
    </div>`;
    container.querySelector('.notice-close')?.addEventListener('click', () => { container.innerHTML = ''; });

    // Drop the query param so a refresh — or a link someone pastes to a friend
    // — doesn't replay "payment received" for a person who never bought a thing.
    const url = new URL(window.location.href);
    url.searchParams.delete('ad');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

function updateEstimate(): void {
    if (!estimate || !cpmInput || !budgetInput) return;
    const cpm = Number(cpmInput.value);
    const budget = Number(budgetInput.value);
    if (!(cpm > 0) || !(budget > 0)) {
        estimate.textContent = 'Enter a price and budget to see your views';
        return;
    }
    const views = Math.floor((budget / cpm) * 1000);
    estimate.textContent = `≈ ${views.toLocaleString()} views`;
}

function scrollToAdvertise(): void {
    document.querySelector('#advertise')?.scrollIntoView({ behavior: 'smooth' });
}

document.querySelector('#header-cta')?.addEventListener('click', scrollToAdvertise);
document.querySelector('#hero-cta')?.addEventListener('click', scrollToAdvertise);

cpmInput?.addEventListener('input', updateEstimate);
budgetInput?.addEventListener('input', updateEstimate);

form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const raw = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const payload = {
        headline: raw.headline,
        url: raw.url,
        email: raw.email,
        cpmCents: Math.round(Number(raw.cpmDollars) * 100),
        budgetCents: Math.round(Number(raw.budgetDollars) * 100),
    };

    if (button) { button.disabled = true; button.textContent = 'Starting checkout…'; }
    try {
        const response = await api.post<{ checkoutUrl?: string }>('/api/ads?action=checkout', payload);
        if (response.data.checkoutUrl) {
            if (status) { status.textContent = 'Redirecting to secure checkout…'; status.className = 'form-status success'; }
            window.location.assign(response.data.checkoutUrl);
            return;
        }
        if (status) { status.textContent = 'Checkout could not be started. Please try again.'; status.className = 'form-status error'; }
    } catch (err) {
        if (status) { status.textContent = err instanceof ApiError ? err.message : 'Could not start checkout. Please try again.'; status.className = 'form-status error'; }
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Continue to payment →'; }
    }
});

showNotice();
updateEstimate();
loadSponsoredSlot();
