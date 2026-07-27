import { createIcons, Store, Plus, X, ArrowRight, ShieldCheck } from 'lucide';
import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';
import { requireSignIn, currentUserEmail } from './auth';

type Listing = { id: string; name: string; tagline: string; description: string; priceCents: number; url: string; createdAt: string };

const PLATFORM_FEE_RATE = 0.1;
const money = (cents: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const styleText = `
.marketplace{padding:100px 0;background:#10131b;color:#fff}
.marketplace .section-wrap{max-width:1180px}
.marketplace-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:36px;flex-wrap:wrap}
.marketplace-head h2{font-family:'Syne',sans-serif;font-size:clamp(34px,4.4vw,52px);letter-spacing:-.05em;margin:0 0 10px}
.marketplace-head p{color:#b9c0b4;max-width:520px;line-height:1.6;margin:0}
.marketplace-fee-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(201,255,87,.12);border:1px solid rgba(201,255,87,.3);color:#c9ff57;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:800;letter-spacing:.04em}
.marketplace-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.marketplace-card{background:#171a24;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:22px;display:flex;flex-direction:column;min-height:220px}
.marketplace-card h3{font-family:'Syne',sans-serif;font-size:22px;margin:0 0 6px}
.marketplace-card p{color:#b9c0b4;font-size:14px;line-height:1.55;margin:0 0 18px;flex:1}
.marketplace-card-footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.08);padding-top:14px}
.marketplace-price{font-family:'Syne',sans-serif;font-weight:800;font-size:18px}
.marketplace-buy{background:#c9ff57;color:#10131b;border:0;border-radius:10px;padding:10px 16px;font-weight:800;cursor:pointer}
.marketplace-empty{grid-column:1/-1;padding:48px;text-align:center;border:1px dashed rgba(255,255,255,.18);border-radius:18px;color:#b9c0b4}
.marketplace-sell-button{background:transparent;border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:12px;padding:12px 18px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
.mp-modal{position:fixed;inset:0;display:grid;place-items:center;z-index:95;opacity:0;visibility:hidden;transition:.2s ease}
.mp-modal.open{opacity:1;visibility:visible}
.mp-modal-backdrop{position:absolute;inset:0;background:rgba(8,10,14,.72);backdrop-filter:blur(8px)}
.mp-modal-card{position:relative;z-index:1;width:min(480px,calc(100% - 28px));max-height:88vh;overflow:auto;background:#fff;color:#10131b;border-radius:22px;padding:30px}
.mp-modal-card h2{font-family:'Syne',sans-serif;font-size:28px;margin:6px 0 18px;letter-spacing:-.04em}
.mp-modal-close{position:absolute;top:16px;right:16px;width:38px;height:38px;border-radius:11px;border:1px solid rgba(16,19,27,.14);background:#fff;display:grid;place-items:center;cursor:pointer}
.mp-modal-card label{display:block;font-size:13px;font-weight:700;margin-bottom:12px;color:#454b40}
.mp-modal-card input,.mp-modal-card textarea{width:100%;margin-top:6px;border:1px solid rgba(16,19,27,.16);border-radius:10px;padding:11px 12px;font:inherit}
.mp-modal-card button[type="submit"]{width:100%;background:#10131b;color:#fff;border:0;border-radius:12px;padding:14px;font-weight:800;cursor:pointer;margin-top:6px}
.mp-fee-breakdown{background:#f5f6ef;border-radius:14px;padding:16px;margin:6px 0 18px;font-size:13px}
.mp-fee-row{display:flex;justify-content:space-between;padding:4px 0}
.mp-fee-row.total{font-weight:800;border-top:1px solid rgba(16,19,27,.12);margin-top:6px;padding-top:10px}
.mp-demo-note{display:flex;gap:8px;align-items:flex-start;background:#fff7e0;border:1px solid #f0d98c;border-radius:12px;padding:12px;font-size:12px;color:#6b5a12;margin-bottom:16px}
.mp-status{font-size:13px;margin-top:10px;min-height:18px}
.mp-status.success{color:#2e7d32}
.mp-status.error{color:#c0392b}
@media(max-width:980px){.marketplace-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:680px){.marketplace-grid{grid-template-columns:1fr}.marketplace{padding:70px 0}}
`;

export function mountMarketplace(): void {
    const anchor = document.querySelector<HTMLElement>('#launch-directory');
    if (!anchor || document.querySelector('#marketplace')) return;

    const style = document.createElement('style');
    style.dataset.freshsaasMarketplace = 'true';
    style.textContent = styleText;
    document.head.appendChild(style);

    const section = document.createElement('section');
    section.id = 'marketplace';
    section.className = 'marketplace';
    section.innerHTML = `<div class="section-wrap">
        <div class="marketplace-head">
            <div><span class="marketplace-fee-badge"><i data-lucide="store"></i> FreshSAAS Marketplace</span><h2>Buy a live SaaS. Sell yours.</h2><p>Founders list a running SaaS product for sale; buyers acquire it directly. FreshSAAS charges a 10% platform fee on every completed sale — sellers keep 90%.</p></div>
            <button id="mp-sell-button" class="marketplace-sell-button" type="button"><i data-lucide="plus"></i> List your SaaS for sale</button>
        </div>
        <div id="mp-grid" class="marketplace-grid"><p class="marketplace-empty">Loading marketplace listings…</p></div>
    </div>`;
    anchor.after(section);

    const sellModal = document.createElement('div');
    sellModal.className = 'mp-modal';
    sellModal.id = 'mp-sell-modal';
    sellModal.setAttribute('aria-hidden', 'true');
    sellModal.innerHTML = `<div class="mp-modal-backdrop" data-mp-close="sell"></div><div class="mp-modal-card" role="dialog" aria-modal="true" aria-labelledby="mp-sell-title"><button class="mp-modal-close" type="button" data-mp-close="sell" aria-label="Close"><i data-lucide="x"></i></button><h2 id="mp-sell-title">List your SaaS</h2><p id="mp-sell-identity" style="font-size:12px;color:#6d7469;margin:-8px 0 14px"></p><form id="mp-sell-form"><label>Product name<input name="name" required maxlength="120"></label><label>One-line tagline<input name="tagline" required maxlength="200"></label><label>Description for buyers<textarea name="description" rows="3" required maxlength="2000"></textarea></label><label>Asking price (USD)<input name="priceUsd" type="number" min="1" step="1" required></label><label>Product URL<input name="url" type="url" required placeholder="https://"></label><p style="font-size:12px;color:#6d7469;margin:-4px 0 14px">Listings are reviewed before going live. FreshSAAS takes a 10% fee when your SaaS sells.</p><button type="submit">Submit listing for review <i data-lucide="arrow-right"></i></button><p id="mp-sell-status" class="mp-status" role="status" aria-live="polite"></p></form></div>`;
    document.body.appendChild(sellModal);

    const buyModal = document.createElement('div');
    buyModal.className = 'mp-modal';
    buyModal.id = 'mp-buy-modal';
    buyModal.setAttribute('aria-hidden', 'true');
    buyModal.innerHTML = `<div class="mp-modal-backdrop" data-mp-close="buy"></div><div class="mp-modal-card" role="dialog" aria-modal="true" aria-labelledby="mp-buy-title"><button class="mp-modal-close" type="button" data-mp-close="buy" aria-label="Close"><i data-lucide="x"></i></button><h2 id="mp-buy-title">Buy this SaaS</h2><p id="mp-buy-identity" style="font-size:12px;color:#6d7469;margin:-8px 0 14px"></p><div class="mp-demo-note"><i data-lucide="shield-check"></i><span>Demo checkout: no payment processor is connected yet, so this does not charge a real card. It previews the order and fee split.</span></div><div id="mp-fee-breakdown" class="mp-fee-breakdown"></div><form id="mp-buy-form"><input type="hidden" name="listingId"><button type="submit">Complete demo purchase <i data-lucide="arrow-right"></i></button><p id="mp-buy-status" class="mp-status" role="status" aria-live="polite"></p></form></div>`;
    document.body.appendChild(buyModal);

    const grid = section.querySelector<HTMLElement>('#mp-grid');
    const sellButton = section.querySelector<HTMLButtonElement>('#mp-sell-button');
    const sellForm = sellModal.querySelector<HTMLFormElement>('#mp-sell-form');
    const sellStatus = sellModal.querySelector<HTMLElement>('#mp-sell-status');
    const buyForm = buyModal.querySelector<HTMLFormElement>('#mp-buy-form');
    const buyStatus = buyModal.querySelector<HTMLElement>('#mp-buy-status');
    const feeBreakdown = buyModal.querySelector<HTMLElement>('#mp-fee-breakdown');
    let listings: Listing[] = [];

    const renderIcons = (): void => createIcons({ icons: { Store, Plus, X, ArrowRight, ShieldCheck } });

    const openModal = (element: HTMLElement): void => {
        element.classList.add('open');
        element.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };
    const closeModal = (element: HTMLElement): void => {
        element.classList.remove('open');
        element.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    const renderListings = (): void => {
        if (!grid) return;
        grid.innerHTML = listings.length
            ? listings.map(listing => `<article class="marketplace-card"><h3>${escapeHtml(listing.name)}</h3><p>${escapeHtml(listing.tagline)}</p><div class="marketplace-card-footer"><span class="marketplace-price">${money(listing.priceCents)}</span><button class="marketplace-buy" type="button" data-mp-buy="${escapeHtml(listing.id)}">Buy</button></div></article>`).join('')
            : '<p class="marketplace-empty">No live listings yet. Be the first to list your SaaS for sale.</p>';
        renderIcons();
    };

    const loadListings = async (): Promise<void> => {
        try {
            const response = await api.get<{ listings: Listing[] }>('/api/marketplace-listings');
            listings = response.data?.listings || [];
            renderListings();
        } catch {
            if (grid) grid.innerHTML = '<p class="marketplace-empty">Marketplace listings could not be loaded.</p>';
        }
    };

    sellButton?.addEventListener('click', async () => {
        if (!(await requireSignIn())) return;
        const identity = sellModal.querySelector<HTMLElement>('#mp-sell-identity');
        if (identity) identity.textContent = `Listing as ${currentUserEmail() ?? 'your account'}.`;
        openModal(sellModal);
    });
    sellModal.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-mp-close]')) closeModal(sellModal); });
    buyModal.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-mp-close]')) closeModal(buyModal); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal(sellModal); closeModal(buyModal); } });

    grid?.addEventListener('click', async event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mp-buy]');
        const listing = listings.find(item => item.id === button?.dataset.mpBuy);
        if (!listing || !buyForm || !feeBreakdown) return;
        if (!(await requireSignIn())) return;
        const fee = Math.round(listing.priceCents * PLATFORM_FEE_RATE);
        (buyForm.elements.namedItem('listingId') as HTMLInputElement).value = listing.id;
        feeBreakdown.innerHTML = `<div class="mp-fee-row"><span>${escapeHtml(listing.name)}</span><span>${money(listing.priceCents)}</span></div><div class="mp-fee-row"><span>FreshSAAS platform fee (10%)</span><span>-${money(fee)}</span></div><div class="mp-fee-row total"><span>Seller receives</span><span>${money(listing.priceCents - fee)}</span></div>`;
        const identity = buyModal.querySelector<HTMLElement>('#mp-buy-identity');
        if (identity) identity.textContent = `Buying as ${currentUserEmail() ?? 'your account'}.`;
        if (buyStatus) { buyStatus.textContent = ''; buyStatus.className = 'mp-status'; }
        openModal(buyModal);
    });

    sellForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!sellForm.checkValidity()) { sellForm.reportValidity(); return; }
        const button = sellForm.querySelector<HTMLButtonElement>('button[type="submit"]');
        const payload = Object.fromEntries(new FormData(sellForm).entries());
        if (button) button.disabled = true;
        try {
            await api.postAuthed('/api/marketplace-listings', payload);
            if (sellStatus) { sellStatus.textContent = 'Listing submitted. We will review it before it goes live.'; sellStatus.className = 'mp-status success'; }
            sellForm.reset();
        } catch (err) {
            if (sellStatus) { sellStatus.textContent = err instanceof ApiError ? err.message : 'Could not submit listing. Please try again.'; sellStatus.className = 'mp-status error'; }
        } finally {
            if (button) button.disabled = false;
        }
    });

    buyForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!buyForm.checkValidity()) { buyForm.reportValidity(); return; }
        const button = buyForm.querySelector<HTMLButtonElement>('button[type="submit"]');
        const payload = Object.fromEntries(new FormData(buyForm).entries());
        if (button) button.disabled = true;
        try {
            const response = await api.postAuthed<{ message: string }>('/api/marketplace-orders', payload);
            if (buyStatus) { buyStatus.textContent = response.data.message; buyStatus.className = 'mp-status success'; }
        } catch (err) {
            if (buyStatus) { buyStatus.textContent = err instanceof ApiError ? err.message : 'Could not record this order. Please try again.'; buyStatus.className = 'mp-status error'; }
        } finally {
            if (button) button.disabled = false;
        }
    });

    renderIcons();
    loadListings();
}
