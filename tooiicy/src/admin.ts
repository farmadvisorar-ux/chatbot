import './admin.css';
import { escapeHtml } from './escape-html';

type Product = {
    id: string; slug: string; name: string; description: string; imageUrl: string | null;
    active: boolean; sortOrder: number; createdAt: string;
};
type Variant = {
    id: string; productId: string; printfulVariantId: string; name: string;
    priceCents: number; imageUrl: string | null; inStock: boolean; sortOrder: number;
};
type OrderItem = { name: string; quantity: number; unitPriceCents: number };
type Order = {
    id: string; email: string | null; status: string; subtotalCents: number; shippingCents: number;
    totalCents: number; shippingName: string | null;
    shippingAddress: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
    printfulOrderId: string | number | null; trackingNumber: string | null; trackingUrl: string | null;
    fulfillmentError: string | null; paidAt: string | null; createdAt: string; items: OrderItem[];
};
type SocialLink = { id: string; platform: string; url: string; active: boolean; sortOrder: number; createdAt: string };

const ORDER_STATUSES = ['awaiting_payment', 'paid', 'submitted_to_printful', 'fulfillment_error', 'shipped', 'cancelled'];
const STORAGE_KEY = 'tooiicy_admin_key';
const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

const loginSection = $('#admin-login');
const appSection = $('#admin-app');
const loginForm = $<HTMLFormElement>('#login-form');
const keyInput = $<HTMLInputElement>('#admin-key');
const rememberInput = $<HTMLInputElement>('#remember');
const loginStatus = $('#login-status');
const ordersList = $('#orders-list');
const productsList = $('#products-list');
const statsEl = $('#stats');
const productForm = $<HTMLFormElement>('#product-form');
const productStatus = $('#product-status');
const variantRows = $('#pf-variants');

let adminKey = '';
let latestProducts: Product[] = [];
let latestVariants: Variant[] = [];
let latestOrders: Order[] = [];
let latestSocialLinks: SocialLink[] = [];

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const day = (value: string | null): string =>
    value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

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

/* ---------------- stats ---------------- */

function renderStats(): void {
    const revenueCents = latestOrders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.totalCents, 0);
    const needsAttention = latestOrders.filter(o => o.status === 'fulfillment_error').length;
    statsEl.innerHTML = [
        ['Orders', String(latestOrders.length)],
        ['Revenue', money(revenueCents)],
        ['Needs attention', String(needsAttention)],
    ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label!)}</span><b>${escapeHtml(value!)}</b></div>`).join('');
}

/* ---------------- orders ---------------- */

function renderOrders(): void {
    $('#count-orders').textContent = String(latestOrders.length);
    ordersList.innerHTML = latestOrders.length ? latestOrders.map(order => {
        const address = order.shippingAddress;
        const addressLine = address
            ? [address.line1, address.line2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', ')
            : null;
        return `
      <article class="item${order.status === 'fulfillment_error' ? ' is-flagged' : ''}" data-id="${escapeHtml(order.id)}">
        <div class="item-head">
          <h3>${escapeHtml(order.shippingName || order.email || order.id.slice(0, 8))}</h3>
          <span class="badge ${order.status}">${order.status.replace(/_/g, ' ')}</span>
        </div>
        <p class="meta">
          ${order.email ? `<a href="mailto:${escapeHtml(order.email)}">${escapeHtml(order.email)}</a> &nbsp;·&nbsp; ` : ''}
          placed ${escapeHtml(day(order.createdAt))}
          ${addressLine ? `<br>${escapeHtml(addressLine)}` : ''}
          ${order.trackingNumber ? `<br>Tracking: ${escapeHtml(order.trackingNumber)}${order.trackingUrl ? ` (<a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener">link</a>)` : ''}` : ''}
          ${order.fulfillmentError ? `<br><span style="color:var(--danger)">Error: ${escapeHtml(order.fulfillmentError)}</span>` : ''}
        </p>
        <div class="order-items">
          ${(order.items ?? []).map(item => `<div><span>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</span><span>${escapeHtml(money(item.unitPriceCents * item.quantity))}</span></div>`).join('')}
          <div><b>Total</b><b>${escapeHtml(money(order.totalCents))}</b></div>
        </div>
        <div class="row">
          ${['paid', 'fulfillment_error'].includes(order.status) ? `<button type="button" class="small" data-action="retry">Retry fulfillment</button>` : ''}
          <button type="button" class="ghost small" data-action="set-status">Change status</button>
        </div>
      </article>`;
    }).join('') : `<div class="empty">No orders yet.</div>`;
}

async function onOrderClick(event: Event): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const id = button.closest<HTMLElement>('[data-id]')?.dataset.id;
    const action = button.dataset.action;
    if (!id || !action) return;

    if (action === 'retry') {
        button.disabled = true;
        try {
            await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'retry_fulfillment', orderId: id }) });
            await loadAll();
        } catch (err) {
            button.disabled = false;
            alert(err instanceof Error ? err.message : 'Retry failed');
        }
        return;
    }

    if (action === 'set-status') {
        const status = prompt(`New status (${ORDER_STATUSES.join(', ')})`);
        if (!status || !ORDER_STATUSES.includes(status)) return;
        try {
            await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'update_order_status', id, status }) });
            await loadAll();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Update failed');
        }
    }
}

ordersList.addEventListener('click', onOrderClick);

/* ---------------- products ---------------- */

function renderProducts(): void {
    $('#count-products').textContent = String(latestProducts.length);
    productsList.innerHTML = latestProducts.length ? latestProducts.map(product => {
        const variants = latestVariants.filter(v => v.productId === product.id);
        return `
      <article class="item" data-id="${escapeHtml(product.id)}">
        <div class="item-head">
          <h3>${escapeHtml(product.name)}</h3>
          <span class="badge ${product.active ? 'active' : 'inactive'}">${product.active ? 'active' : 'hidden'}</span>
        </div>
        <p class="meta">/${escapeHtml(product.slug)}</p>
        ${variants.map(v => `
          <div class="variant-row" data-variant-id="${escapeHtml(v.id)}">
            <span class="grow">${escapeHtml(v.name)} — ${escapeHtml(money(v.priceCents))} <span class="badge ${v.inStock ? 'instock' : 'outofstock'}">${v.inStock ? 'in stock' : 'out of stock'}</span></span>
            <button type="button" class="ghost small" data-variant-action="price">Edit price</button>
            <button type="button" class="ghost small" data-variant-action="stock">${v.inStock ? 'Mark out of stock' : 'Mark in stock'}</button>
          </div>
        `).join('')}
        <div class="row">
          <button type="button" class="ghost small" data-action="toggle-active">${product.active ? 'Hide' : 'Unhide'}</button>
          <button type="button" class="ghost small" data-action="add-variant">+ Add variant</button>
        </div>
      </article>`;
    }).join('') : `<div class="empty">No products yet — add one below.</div>`;
}

async function onProductClick(event: Event): Promise<void> {
    const target = event.target as HTMLElement;
    const variantRow = target.closest<HTMLElement>('[data-variant-id]');
    const variantAction = target.closest<HTMLButtonElement>('button[data-variant-action]')?.dataset.variantAction;
    if (variantRow && variantAction) {
        const variantId = variantRow.dataset.variantId!;
        const variant = latestVariants.find(v => v.id === variantId);
        if (!variant) return;
        try {
            if (variantAction === 'price') {
                const input = prompt('New price in dollars', (variant.priceCents / 100).toFixed(2));
                if (!input) return;
                const priceCents = Math.round(Number(input) * 100);
                if (!Number.isFinite(priceCents) || priceCents <= 0) { alert('Enter a valid price'); return; }
                await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'update_variant', id: variantId, priceCents }) });
            } else if (variantAction === 'stock') {
                await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'update_variant', id: variantId, inStock: !variant.inStock }) });
            }
            await loadAll();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Update failed');
        }
        return;
    }

    const button = target.closest<HTMLButtonElement>('button[data-action]');
    const productId = button?.closest<HTMLElement>('[data-id]')?.dataset.id;
    if (!button || !productId) return;
    const product = latestProducts.find(p => p.id === productId);
    if (!product) return;

    if (button.dataset.action === 'toggle-active') {
        try {
            await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'update_product', id: productId, active: !product.active }) });
            await loadAll();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Update failed');
        }
        return;
    }

    if (button.dataset.action === 'add-variant') {
        const printfulVariantId = Number(prompt('Printful sync variant id (from your store product)'));
        const name = prompt('Variant name (e.g. "Black / M")');
        const priceInput = prompt('Price in dollars');
        if (!printfulVariantId || !name || !priceInput) return;
        const priceCents = Math.round(Number(priceInput) * 100);
        if (!Number.isFinite(priceCents) || priceCents <= 0) { alert('Enter a valid price'); return; }
        try {
            await callAdmin('/api/admin', {
                method: 'POST',
                body: JSON.stringify({ action: 'add_variant', productId, printfulVariantId, name, priceCents }),
            });
            await loadAll();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Add variant failed');
        }
    }
}

productsList.addEventListener('click', onProductClick);

/* ---------------- social links ---------------- */

const socialForm = $<HTMLFormElement>('#social-form');
const socialStatus = $('#social-status');
const socialLinksList = $('#social-links-list');

function renderSocialLinks(): void {
    $('#count-social').textContent = String(latestSocialLinks.length);
    socialLinksList.innerHTML = latestSocialLinks.length ? latestSocialLinks.map(link => `
      <article class="item" data-id="${escapeHtml(link.id)}">
        <div class="item-head">
          <h3>${escapeHtml(link.platform)}</h3>
          <span class="badge ${link.active ? 'active' : 'inactive'}">${link.active ? 'active' : 'hidden'}</span>
        </div>
        <p class="meta"><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.url)}</a></p>
        <div class="row">
          <button type="button" class="ghost small" data-action="toggle-active">${link.active ? 'Hide' : 'Show'}</button>
          <button type="button" class="ghost small danger" data-action="delete">Delete</button>
        </div>
      </article>
    `).join('') : `<div class="empty">No social links yet — add one below.</div>`;
}

async function onSocialLinkClick(event: Event): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const id = button.closest<HTMLElement>('[data-id]')?.dataset.id;
    const action = button.dataset.action;
    if (!id || !action) return;

    const link = latestSocialLinks.find(l => l.id === id);
    if (!link) return;

    try {
        if (action === 'toggle-active') {
            await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'update_social_link', id, active: !link.active }) });
        } else if (action === 'delete') {
            if (!confirm(`Delete ${link.platform}?`)) return;
            await callAdmin('/api/admin', { method: 'POST', body: JSON.stringify({ action: 'delete_social_link', id }) });
        }
        await loadAll();
    } catch (err) {
        alert(err instanceof Error ? err.message : 'Action failed');
    }
}

socialLinksList.addEventListener('click', onSocialLinkClick);

socialForm.addEventListener('submit', async event => {
    event.preventDefault();
    socialStatus.textContent = 'Saving…';
    socialStatus.className = 'status';

    const platform = $<HTMLInputElement>('#social-platform').value.trim();
    const url = $<HTMLInputElement>('#social-url').value.trim();

    try {
        await callAdmin('/api/admin', {
            method: 'POST',
            body: JSON.stringify({ action: 'create_social_link', platform, url }),
        });
        socialStatus.textContent = 'Link added.';
        socialStatus.className = 'status success';
        socialForm.reset();
        await loadAll();
    } catch (err) {
        socialStatus.textContent = err instanceof Error ? err.message : 'Could not add link';
        socialStatus.className = 'status error';
    }
});

/* ---------------- create-product form ---------------- */

function addVariantRow(): void {
    const row = document.createElement('div');
    row.className = 'pf-variant-row';
    row.innerHTML = `
        <input type="number" min="1" placeholder="Printful sync variant id" data-field="printfulVariantId" required>
        <input type="text" placeholder="Name (e.g. Black / M)" data-field="name" required>
        <input type="number" min="0.01" step="0.01" placeholder="Price ($)" data-field="priceDollars" required>
    `;
    variantRows.appendChild(row);
}
$('#pf-add-variant').addEventListener('click', addVariantRow);
addVariantRow();

productForm.addEventListener('submit', async event => {
    event.preventDefault();
    productStatus.textContent = 'Saving…';
    productStatus.className = 'status';

    const variants = Array.from(variantRows.querySelectorAll<HTMLElement>('.pf-variant-row')).map(row => {
        const printfulVariantId = Number((row.querySelector('[data-field="printfulVariantId"]') as HTMLInputElement).value);
        const name = (row.querySelector('[data-field="name"]') as HTMLInputElement).value.trim();
        const priceDollars = Number((row.querySelector('[data-field="priceDollars"]') as HTMLInputElement).value);
        return { printfulVariantId, name, priceCents: Math.round(priceDollars * 100) };
    });

    try {
        await callAdmin('/api/admin', {
            method: 'POST',
            body: JSON.stringify({
                action: 'create_product',
                slug: $<HTMLInputElement>('#pf-slug').value.trim(),
                name: $<HTMLInputElement>('#pf-name').value.trim(),
                description: $<HTMLTextAreaElement>('#pf-description').value.trim(),
                imageUrl: $<HTMLInputElement>('#pf-image').value.trim(),
                variants,
            }),
        });
        productStatus.textContent = 'Product created.';
        productStatus.className = 'status success';
        productForm.reset();
        variantRows.innerHTML = '';
        addVariantRow();
        await loadAll();
    } catch (err) {
        productStatus.textContent = err instanceof Error ? err.message : 'Could not create product';
        productStatus.className = 'status error';
    }
});

/* ---------------- load + auth ---------------- */

async function loadAll(): Promise<void> {
    const data = await callAdmin<{ products: Product[]; variants: Variant[]; orders: Order[]; socialLinks: SocialLink[] }>('/api/admin');
    latestProducts = data.products;
    latestVariants = data.variants;
    latestOrders = data.orders;
    latestSocialLinks = data.socialLinks;
    renderStats();
    renderOrders();
    renderProducts();
    renderSocialLinks();
}

function showApp(): void {
    loginSection.hidden = true;
    appSection.hidden = false;
}

async function trySignIn(key: string, remember: boolean): Promise<void> {
    adminKey = key;
    loginStatus.textContent = 'Checking…';
    loginStatus.className = 'status';
    try {
        await loadAll();
        if (remember) localStorage.setItem(STORAGE_KEY, key);
        else localStorage.removeItem(STORAGE_KEY);
        showApp();
    } catch (err) {
        adminKey = '';
        localStorage.removeItem(STORAGE_KEY);
        loginStatus.textContent = err instanceof Error ? err.message : 'Sign-in failed';
        loginStatus.className = 'status error';
    }
}

loginForm.addEventListener('submit', event => {
    event.preventDefault();
    trySignIn(keyInput.value.trim(), rememberInput.checked);
});

$('#refresh').addEventListener('click', () => { loadAll().catch(() => undefined); });

$('#signout').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    adminKey = '';
    appSection.hidden = true;
    loginSection.hidden = false;
    keyInput.value = '';
});

document.querySelector('.tabs')?.addEventListener('click', event => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.toggle('active', (panel as HTMLElement).dataset.panel === tab.dataset.tab);
    });
});

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) trySignIn(saved, true);
