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
    paid: 'Payment received',
    submitted_to_printful: 'Sent to production',
    fulfillment_error: 'Payment received — finalizing your order',
    shipped: 'Shipped',
};

function render(order: Order): void {
    if (!root) return;
    root.innerHTML = `
        <div class="receipt">
            <h1>Thank you</h1>
            <p>Your order is confirmed.</p>
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

// PayPal appends ?token={PAYPAL_ORDER_ID} to the return URL.
const params = new URLSearchParams(window.location.search);
const paypalOrderId = params.get('token');

if (!paypalOrderId) {
    renderError('No order was specified.');
} else {
    api.post<{ order: Order }>('/api/capture', { paypalOrderId })
        .then(({ data }) => {
            render(data.order);
            clearCart();
        })
        .catch(err => {
            renderError(err instanceof ApiError ? err.message : 'Could not confirm your payment. Please contact us.');
        });
}
