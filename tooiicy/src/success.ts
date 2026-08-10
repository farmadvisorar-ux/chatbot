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
};

const yearEl = document.querySelector('#year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const root = document.querySelector('#receipt-root');

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const STATUS_LABEL: Record<string, string> = {
    awaiting_payment: 'Confirming payment…',
    paid: 'Payment received',
    submitted_to_printful: 'Sent to production',
    fulfillment_error: 'Payment received — finalizing your order',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
};

const PAID_STATUSES = new Set(['paid', 'submitted_to_printful', 'fulfillment_error', 'shipped']);

function render(order: Order, pending = false): void {
    if (!root) return;
    root.innerHTML = `
        <div class="receipt">
            <h1>${pending ? 'Almost there' : 'Thank you'}</h1>
            <p>${pending ? 'Confirming your payment — this usually takes a few seconds.' : 'Your order is confirmed.'}</p>
            <span class="receipt-status">${escapeHtml(STATUS_LABEL[order.status] || order.status)}</span>
            <div class="receipt-items">
                ${order.items.map(item => `
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
    return data.order;
}

async function waitForPaidOrder(sessionId: string): Promise<void> {
    const started = Date.now();
    const timeoutMs = 45_000;
    let delay = 800;

    while (Date.now() - started < timeoutMs) {
        try {
            const order = await loadOrder(sessionId);
            if (PAID_STATUSES.has(order.status)) {
                render(order);
                clearCart();
                return;
            }
            if (order.status === 'cancelled') {
                renderError('This checkout was cancelled. Your card was not charged.');
                return;
            }
            render(order, true);
        } catch (err) {
            // 404 is common for a beat or two before stripe_session_id is written.
            if (!(err instanceof ApiError && err.status === 404)) {
                renderError(err instanceof ApiError ? err.message : 'Could not load your order.');
                return;
            }
            if (root) {
                root.innerHTML = `<div class="receipt"><h1>Almost there</h1><p>Confirming your payment…</p></div>`;
            }
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.4, 4000);
    }

    try {
        const order = await loadOrder(sessionId);
        render(order, !PAID_STATUSES.has(order.status));
        if (PAID_STATUSES.has(order.status)) clearCart();
    } catch (err) {
        renderError(err instanceof ApiError ? err.message : 'Payment is still confirming. Check your email receipt, or refresh in a moment.');
    }
}

const sessionId = new URLSearchParams(window.location.search).get('session_id');
if (!sessionId) {
    renderError('No order was specified.');
} else {
    waitForPaidOrder(sessionId);
}
