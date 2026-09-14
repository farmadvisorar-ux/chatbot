import './styles.css';
import { initAuth, requireSignIn } from './auth.js';
import { escapeHtml } from './escape-html.js';
import { apiFetch } from './api-client.js';

initAuth();

interface Tier {
    id: number;
    name: string;
    price: string;
    billing_period: string;
    description: string;
    features: string[];
    ctaLabel: string;
    coming_soon: boolean;
    badge?: string;
    featured?: boolean;
    slug?: string;
}

function tierCard(tier: Tier): string {
    // "Everything in X, plus:" is a lead-in, not a feature — it gets no
    // checkmark, so the tick column lines up with things you actually gain.
    const features = tier.features
        .map(feature => feature.endsWith('plus:')
            ? `<li class="tier-inherit">${escapeHtml(feature)}</li>`
            : `<li>${escapeHtml(feature)}</li>`)
        .join('');

    // Three shapes, in order of what the tier actually is:
    //   unreleased -> a disabled button, because there is nothing to buy and a
    //                 CTA that navigates somewhere unrelated is a worse lie
    //   paid       -> a buy button that opens Stripe Checkout
    //   free       -> a plain link into the product
    const cta = tier.coming_soon
        ? `<button type="button" class="tier-cta coming" disabled>${escapeHtml(tier.ctaLabel)}</button>`
        : tier.slug && tier.slug !== 'free'
            ? `<button type="button" class="tier-cta" data-buy="${escapeHtml(tier.slug)}">${escapeHtml(tier.ctaLabel)}</button>`
            : `<a class="tier-cta" href="./dashboard.html">${escapeHtml(tier.ctaLabel)}</a>`;

    return `
        <article class="tier-card${tier.featured ? ' featured' : ''}${tier.coming_soon ? ' coming' : ''}">
            ${tier.badge ? `<span class="tier-badge${tier.coming_soon ? ' tier-badge-soon' : ''}">${escapeHtml(tier.badge)}</span>` : ''}
            <h2 class="tier-name">${escapeHtml(tier.name)}</h2>
            <div class="tier-price">${escapeHtml(tier.price)}<small> ${escapeHtml(tier.billing_period)}</small></div>
            <p class="tier-desc">${escapeHtml(tier.description)}</p>
            <ul class="tier-features">${features}</ul>
            ${cta}
            <span class="tier-cta-status" data-status-for="${escapeHtml(tier.slug ?? '')}"></span>
        </article>`;
}

const listNames = (names: string[]): string => names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0];

/**
 * The banner above the grid, written from what the API actually returns
 * rather than hardcoded in the page. The original copy said every tier above
 * Free was still being built; as static HTML it would have gone on saying so
 * after they shipped.
 */
function renderStatusBanner(tiers: Tier[]): void {
    const banner = document.querySelector<HTMLElement>('.pricing-status');
    if (!banner) return;

    const live = tiers.filter(t => !t.coming_soon && t.slug !== 'free').map(t => t.name);
    // Nothing buyable yet — leave the page's own "we're still building" copy.
    if (!live.length) return;
    const building = tiers.filter(t => t.coming_soon).map(t => t.name);

    banner.innerHTML = `
        <span class="pricing-status-tag">Live</span>
        <p><strong>${escapeHtml(listNames(live))} ${live.length > 1 ? 'are' : 'is'} available now.</strong>
        ${building.length ? `${escapeHtml(listNames(building))} ${building.length > 1 ? 'are' : 'is'} still in development — each tier ships only when it is genuinely complete, because a security feature that half-works is worse than one that doesn't exist yet. ` : ''}
        Cancel any time from your account page. <strong>Free is live today, and it stays free.</strong></p>`;
}

function setStatus(slug: string, message: string, isError = false): void {
    const el = document.querySelector<HTMLElement>(`[data-status-for="${CSS.escape(slug)}"]`);
    if (!el) return;
    el.textContent = message;
    el.className = `tier-cta-status${isError ? ' error' : ''}`;
}

async function buy(slug: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    setStatus(slug, 'Opening checkout…');
    try {
        // Checkout needs an account to attach the subscription to, so sign-in
        // comes first. Dismissing the sign-in modal leaves the card as it was
        // rather than sending the visitor somewhere they didn't ask to go.
        if (!await requireSignIn()) {
            setStatus(slug, '');
            button.disabled = false;
            return;
        }
        const { url } = await apiFetch<{ url: string }>('/tiers?action=checkout', {
            method: 'POST',
            body: { tier: slug },
        });
        window.location.href = url;
    } catch (err) {
        setStatus(slug, err instanceof Error ? err.message : 'Could not start checkout.', true);
        button.disabled = false;
    }
}

/** An unexplained bounce back from Stripe reads like a failure, so say plainly that nothing happened. */
function noteCancelledCheckout(): void {
    if (new URLSearchParams(window.location.search).get('checkout') !== 'cancelled') return;
    const banner = document.querySelector<HTMLElement>('.pricing-status');
    if (!banner) return;
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.cssText = 'margin:10px 0 0;font-size:13px';
    note.textContent = 'Checkout cancelled — you have not been charged.';
    banner.appendChild(note);
}

async function loadTiers(): Promise<void> {
    const container = document.querySelector<HTMLElement>('#pricing-container');
    if (!container) return;
    try {
        const response = await fetch('/api/tiers');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { tiers } = (await response.json()) as { tiers: Tier[] };
        container.innerHTML = tiers.map(tierCard).join('');
        renderStatusBanner(tiers);
        for (const button of container.querySelectorAll<HTMLButtonElement>('[data-buy]')) {
            button.addEventListener('click', () => void buy(button.dataset.buy!, button));
        }
    } catch {
        container.innerHTML = '<p class="muted">Pricing is temporarily unavailable. Please refresh in a moment.</p>';
    }
    // After the banner is rendered, so it isn't overwritten by it.
    noteCancelledCheckout();
}

void loadTiers();
