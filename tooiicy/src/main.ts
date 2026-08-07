import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';
import { addToCart, cartCount, cartTotalCents, getCart, removeFromCart, setQuantity, type CartItem } from './cart';

type Variant = { id: string; name: string; priceCents: number; imageUrl: string | null; inStock: boolean };
type Product = { id: string; slug: string; name: string; description: string; imageUrl: string | null; variants: Variant[] };

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const yearEl = $('#year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const noticeSlot = $('#notice');
const grid = $('#product-grid');
const overlay = $('#product-overlay');
const modal = $('#product-modal');
const scrim = $('#scrim');
const drawer = $('#cart-drawer');
const cartOpenBtn = $('#cart-open');
const cartCloseBtn = $('#cart-close');
const cartItemsEl = $('#cart-items');
const cartTotalEl = $('#cart-total');
const cartCountEl = $('#cart-count');
const cartCheckoutBtn = $<HTMLButtonElement>('#cart-checkout');
const cartEmailInput = $<HTMLInputElement>('#cart-email');
const cartNotice = $('#cart-notice');

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function showNotice(el: HTMLElement | null, message: string, kind: 'error' | 'ok' = 'error'): void {
    if (!el) return;
    el.innerHTML = `<div class="notice ${kind}">${escapeHtml(message)}</div>`;
}

function clearNotice(el: HTMLElement | null): void {
    if (el) el.innerHTML = '';
}

function priceLabel(product: Product): string {
    const prices = product.variants.map(v => v.priceCents);
    if (prices.length === 0) return '';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

function mediaHtml(imageUrl: string | null, label: string): string {
    return imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(label)}" loading="lazy">`
        : `<div class="placeholder-art">${escapeHtml(label)}</div>`;
}

/* ---------------- product grid ---------------- */

let products: Product[] = [];

function renderGrid(): void {
    if (!grid) return;
    if (products.length === 0) {
        grid.innerHTML = `<div class="empty-state">Nothing in the shop yet — check back soon.</div>`;
        return;
    }
    grid.innerHTML = products.map(product => `
        <article class="card" data-product="${escapeHtml(product.id)}">
            <div class="card-media">${mediaHtml(product.imageUrl, product.name)}</div>
            <div class="card-body">
                <div class="card-name">${escapeHtml(product.name)}</div>
                <div class="card-price">${escapeHtml(priceLabel(product))}</div>
                <div class="card-sub">${escapeHtml(product.variants.length)} option${product.variants.length === 1 ? '' : 's'}</div>
            </div>
        </article>
    `).join('');

    grid.querySelectorAll<HTMLElement>('[data-product]').forEach(card => {
        card.addEventListener('click', () => {
            const product = products.find(p => p.id === card.dataset.product);
            if (product) openProductModal(product);
        });
    });
}

async function loadProducts(): Promise<void> {
    try {
        const { data } = await api.get<{ products: Product[] }>('/api/products');
        products = data.products;
        renderGrid();
    } catch (err) {
        showNotice(noticeSlot, err instanceof ApiError ? err.message : 'Could not load the shop. Try refreshing.');
    }
}

/* ---------------- product modal ---------------- */

let modalQuantity = 1;

function openProductModal(product: Product): void {
    if (!modal || !overlay || !scrim) return;
    modalQuantity = 1;
    const inStockVariants = product.variants.filter(v => v.inStock);

    modal.innerHTML = `
        <button class="modal-close" id="modal-close" type="button" aria-label="Close">✕</button>
        <div class="modal-grid">
            <div class="modal-media">${mediaHtml(product.imageUrl, product.name)}</div>
            <div class="modal-body">
                <h3>${escapeHtml(product.name)}</h3>
                ${product.description ? `<p class="modal-desc">${escapeHtml(product.description)}</p>` : ''}
                <div class="modal-price" id="modal-price"></div>
                ${inStockVariants.length > 0
                    ? `<select class="variant-select" id="modal-variant">
                        ${inStockVariants.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join('')}
                       </select>`
                    : `<p class="modal-desc">Sold out — check back soon.</p>`}
                <div class="qty-row">
                    <button class="qty-btn" id="modal-qty-dec" type="button" aria-label="Decrease quantity">–</button>
                    <span class="qty-value" id="modal-qty-value">1</span>
                    <button class="qty-btn" id="modal-qty-inc" type="button" aria-label="Increase quantity">+</button>
                </div>
                <button class="btn btn-primary btn-block" id="modal-add" type="button" ${inStockVariants.length === 0 ? 'disabled' : ''}>
                    Add to cart
                </button>
            </div>
        </div>
    `;

    const variantSelect = $<HTMLSelectElement>('#modal-variant');
    const priceEl = $('#modal-price');
    const qtyValueEl = $('#modal-qty-value');

    const currentVariant = (): Variant | undefined =>
        inStockVariants.find(v => v.id === variantSelect?.value) ?? inStockVariants[0];

    function updatePrice(): void {
        const variant = currentVariant();
        if (priceEl) priceEl.textContent = variant ? money(variant.priceCents) : '';
    }
    updatePrice();
    variantSelect?.addEventListener('change', updatePrice);

    $('#modal-qty-dec')?.addEventListener('click', () => {
        modalQuantity = Math.max(1, modalQuantity - 1);
        if (qtyValueEl) qtyValueEl.textContent = String(modalQuantity);
    });
    $('#modal-qty-inc')?.addEventListener('click', () => {
        modalQuantity = Math.min(10, modalQuantity + 1);
        if (qtyValueEl) qtyValueEl.textContent = String(modalQuantity);
    });

    $('#modal-add')?.addEventListener('click', () => {
        const variant = currentVariant();
        if (!variant) return;
        addToCart({
            variantId: variant.id,
            productName: product.name,
            variantName: variant.name,
            priceCents: variant.priceCents,
            imageUrl: variant.imageUrl ?? product.imageUrl,
        }, modalQuantity);
        closeModal();
        openCart();
    });

    $('#modal-close')?.addEventListener('click', closeModal);

    overlay.classList.add('open');
    scrim.classList.add('open');
}

function closeModal(): void {
    overlay?.classList.remove('open');
    if (!drawer?.classList.contains('open')) scrim?.classList.remove('open');
}

scrim?.addEventListener('click', () => {
    closeModal();
    closeCart();
});

/* ---------------- cart drawer ---------------- */

function renderCart(): void {
    const items = getCart();
    if (cartCountEl) cartCountEl.textContent = String(cartCount());

    if (!cartItemsEl || !cartTotalEl) return;
    if (items.length === 0) {
        cartItemsEl.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
    } else {
        cartItemsEl.innerHTML = items.map((item: CartItem) => `
            <div class="drawer-item" data-variant="${escapeHtml(item.variantId)}">
                <div class="drawer-item-media">${mediaHtml(item.imageUrl, item.productName)}</div>
                <div class="drawer-item-info">
                    <div class="drawer-item-name">${escapeHtml(item.productName)} — ${escapeHtml(item.variantName)}</div>
                    <div class="drawer-item-price">${escapeHtml(money(item.priceCents))} each</div>
                    <div class="qty-row">
                        <button class="qty-btn" data-action="dec" aria-label="Decrease quantity">–</button>
                        <span class="qty-value">${escapeHtml(item.quantity)}</span>
                        <button class="qty-btn" data-action="inc" aria-label="Increase quantity">+</button>
                        <button class="drawer-item-remove" data-action="remove" type="button">Remove</button>
                    </div>
                </div>
            </div>
        `).join('');

        cartItemsEl.querySelectorAll<HTMLElement>('[data-variant]').forEach(row => {
            const variantId = row.dataset.variant!;
            const item = items.find(i => i.variantId === variantId);
            if (!item) return;
            row.querySelector('[data-action="dec"]')?.addEventListener('click', () => setQuantity(variantId, item.quantity - 1));
            row.querySelector('[data-action="inc"]')?.addEventListener('click', () => setQuantity(variantId, item.quantity + 1));
            row.querySelector('[data-action="remove"]')?.addEventListener('click', () => removeFromCart(variantId));
        });
    }

    cartTotalEl.textContent = money(cartTotalCents());
}

function openCart(): void {
    drawer?.classList.add('open');
    scrim?.classList.add('open');
}

function closeCart(): void {
    drawer?.classList.remove('open');
    if (!overlay?.classList.contains('open')) scrim?.classList.remove('open');
}

cartOpenBtn?.addEventListener('click', openCart);
cartCloseBtn?.addEventListener('click', closeCart);

window.addEventListener('tooiicy:cart-changed', renderCart);

cartCheckoutBtn?.addEventListener('click', async () => {
    const items = getCart();
    clearNotice(cartNotice);
    if (items.length === 0) {
        showNotice(cartNotice, 'Your cart is empty.');
        return;
    }
    cartCheckoutBtn.disabled = true;
    cartCheckoutBtn.textContent = 'Redirecting…';
    try {
        const { data } = await api.post<{ url: string }>('/api/checkout', {
            items: items.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
            email: cartEmailInput?.value || undefined,
        });
        window.location.href = data.url;
    } catch (err) {
        showNotice(cartNotice, err instanceof ApiError ? err.message : 'Checkout failed. Try again.');
        cartCheckoutBtn.disabled = false;
        cartCheckoutBtn.textContent = 'Checkout';
    }
});

renderCart();
loadProducts();
