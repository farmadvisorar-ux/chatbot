import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';
import { clearCart } from './cart';

type OrderItem = { name: string; quantity: number; unitPriceCents: number };
type Order = {
    status: string;
    subtotalCents: number;
    shippingCents: number;
    totalCents: number;
    items: OrderItem[];
    trackingNumber?: string | null;
    trackingUrl?: string | null;
};

const yearEl = document.querySelector('#year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const root = document.querySelector('#receipt-root');

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const PAID_STATUSES = new Set(['paid', 'submitted_to_printful', 'fulfillment_error', 'shipped']);

const STATUS_LABEL: Record<string, string> = {
    awaiting_payment: 'Confirming payment…',
    paid: 'Payment received',
    submitted_to_printful: 'Sent to production',
    fulfillment_error: 'Payment received — finalizing your order',
    shipped: 'Shipped',
    cancelled: 'Checkout cancelled',
};

function render(order: Order, headline: string, body: string): void {
    if (!root) return;
    const items = Array.isArray(order.items) ? order.items : [];
    const tracking = order.trackingUrl && /^https?:/i.test(order.trackingUrl)
        ? `<p><a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track shipment${order.trackingNumber ? ` (${escapeHtml(order.trackingNumber)})` : ''}</a></p>`
        : '';
    root.innerHTML = `
        <div class="receipt">
            <h1>${escapeHtml(headline)}</h1>
            <p>${escapeHtml(body)}</p>
            <span class="receipt-status">${escapeHtml(STATUS_LABEL[order.status] || order.status)}</span>
            ${tracking}
            <div class="receipt-items">
                ${items.map(item => `
                    <div class="receipt-line">
                        <span>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</span>
                        <span>${escapeHtml(money(item.unitPriceCents * item.quantity))}</span>
                    </div>
                `).join('')}
                <div class="receipt-line"><span>Shipping</span><span>${escapeHtml(money(order.shippingCents))}</span></div>
                <div class="receipt-line total"><span>Total</span><span>${escapeHtml(money(order.totalCents))}</span></div>
            </div>
        </div>
    `;
}

function renderError(message: string): void {
    if (!root) return;
    root.innerHTML = `<div class="receipt"><h1>Hmm</h1><p>${escapeHtml(message)}</p></div>`;
}

async function loadOrder(sessionId: string): Promise<Order> {
    const { data } = await api.get<{ order: Order }>(`/api/orders?session_id=${encodeURIComponent(sessionId)}`);
    if (!data.order) throw new Error('Order missing from response');
    return data.order;
}

async function waitForPayment(sessionId: string): Promise<Order> {
    const started = Date.now();
    let order = await loadOrder(sessionId);

    // Stripe redirects here before the webhook always finishes. Poll briefly
    // so shoppers see "confirmed" instead of a stuck awaiting_payment receipt.
    while (order.status === 'awaiting_payment' && Date.now() - started < 12_000) {
        render(order, 'One moment', 'Confirming your payment with Stripe…');
        await new Promise(resolve => setTimeout(resolve, 1500));
        order = await loadOrder(sessionId);
    }
    return order;
}

const sessionId = new URLSearchParams(window.location.search).get('session_id');
if (!sessionId) {
    renderError('No order was specified.');
} else {
    waitForPayment(sessionId)
        .then(order => {
            if (PAID_STATUSES.has(order.status)) {
                clearCart();
                render(order, 'Thank you', 'Your order is confirmed.');
                return;
            }
            if (order.status === 'cancelled') {
                render(order, 'Checkout cancelled', 'This checkout was not completed. Your cart is still available.');
                return;
            }
            // Still awaiting — do not clear the cart or claim payment succeeded.
            render(order, 'Payment pending', 'We have not confirmed payment yet. If you just paid, refresh in a few seconds.');
        })
        .catch(err => {
            renderError(err instanceof ApiError ? err.message : 'Could not load your order.');
        });
}
