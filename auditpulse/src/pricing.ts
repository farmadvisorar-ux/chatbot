import './styles.css';
import { initAuth } from './auth.js';
import { escapeHtml } from './escape-html.js';

initAuth();

interface Tier {
    id: number;
    name: string;
    price: string;
    billing_period: string;
    description: string;
    features: string[];
    ctaLabel: string;
    badge?: string;
    featured?: boolean;
}

function tierCard(tier: Tier): string {
    // "Everything in X, plus:" is a lead-in, not a feature — it gets no
    // checkmark, so the tick column lines up with things you actually gain.
    const features = tier.features
        .map(feature => feature.endsWith('plus:')
            ? `<li class="tier-inherit">${escapeHtml(feature)}</li>`
            : `<li>${escapeHtml(feature)}</li>`)
        .join('');
    return `
        <article class="tier-card${tier.featured ? ' featured' : ''}">
            ${tier.badge ? `<span class="tier-badge">${escapeHtml(tier.badge)}</span>` : ''}
            <h2 class="tier-name">${escapeHtml(tier.name)}</h2>
            <div class="tier-price">${escapeHtml(tier.price)}<small> ${escapeHtml(tier.billing_period)}</small></div>
            <p class="tier-desc">${escapeHtml(tier.description)}</p>
            <ul class="tier-features">${features}</ul>
            <a class="tier-cta" href="./dashboard.html">${escapeHtml(tier.ctaLabel)}</a>
        </article>`;
}

async function loadTiers(): Promise<void> {
    const container = document.querySelector<HTMLElement>('#pricing-container');
    if (!container) return;
    try {
        const response = await fetch('/api/tiers');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { tiers } = (await response.json()) as { tiers: Tier[] };
        container.innerHTML = tiers.map(tierCard).join('');
    } catch {
        container.innerHTML = '<p class="muted">Pricing is temporarily unavailable. Please refresh in a moment.</p>';
    }
}

loadTiers();
