export type CartItem = {
    variantId: string;
    productName: string;
    variantName: string;
    priceCents: number;
    imageUrl: string | null;
    quantity: number;
};

const STORAGE_KEY = 'tooiicy_cart_v1';
const MAX_QUANTITY = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The cart lives in localStorage, not a server session — there is no account
 * system, and a shopper's browser is the only durable place to remember what
 * they picked between page loads. The server never trusts these prices; it
 * re-looks-up every unit price from product_variants at checkout time.
 */
function sanitizeItem(raw: unknown): CartItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Partial<CartItem>;
    if (typeof item.variantId !== 'string' || !UUID_RE.test(item.variantId)) return null;
    if (typeof item.productName !== 'string' || typeof item.variantName !== 'string') return null;
    const priceCents = Math.trunc(Number(item.priceCents));
    const quantity = Math.trunc(Number(item.quantity));
    if (!Number.isFinite(priceCents) || priceCents < 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        priceCents,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
        quantity: Math.min(MAX_QUANTITY, quantity),
    };
}

function readCart(): CartItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        const byVariant = new Map<string, CartItem>();
        for (const entry of parsed) {
            const item = sanitizeItem(entry);
            if (!item) continue;
            const existing = byVariant.get(item.variantId);
            if (existing) {
                existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + item.quantity);
            } else {
                byVariant.set(item.variantId, item);
            }
        }
        return [...byVariant.values()];
    } catch {
        return [];
    }
}

function writeCart(items: CartItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('tooiicy:cart-changed'));
}

export function getCart(): CartItem[] {
    return readCart();
}

export function cartCount(): number {
    return readCart().reduce((sum, item) => sum + item.quantity, 0);
}

export function cartTotalCents(): number {
    return readCart().reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

/** Flat shipping estimate shown in the cart drawer (must match SHIPPING_FLAT_CENTS default). */
export function shippingEstimateCents(): number {
    return 500;
}

export function addToCart(item: Omit<CartItem, 'quantity'>, quantity = 1): void {
    const items = readCart();
    const qty = Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity) || 1));
    const existing = items.find(i => i.variantId === item.variantId);
    if (existing) {
        existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + qty);
    } else {
        items.push({ ...item, quantity: qty });
    }
    writeCart(items);
}

export function setQuantity(variantId: string, quantity: number): void {
    const items = readCart();
    const existing = items.find(i => i.variantId === variantId);
    if (!existing) return;
    const whole = Math.trunc(quantity);
    if (!Number.isFinite(whole) || whole <= 0) {
        writeCart(items.filter(i => i.variantId !== variantId));
        return;
    }
    existing.quantity = Math.min(MAX_QUANTITY, whole);
    writeCart(items);
}

export function removeFromCart(variantId: string): void {
    writeCart(readCart().filter(i => i.variantId !== variantId));
}

export function clearCart(): void {
    writeCart([]);
}
