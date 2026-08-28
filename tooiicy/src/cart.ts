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

/**
 * The cart lives in localStorage, not a server session — there is no account
 * system, and a shopper's browser is the only durable place to remember what
 * they picked between page loads. The server never trusts these prices; it
 * re-looks-up every unit price from product_variants at checkout time.
 */
function readCart(): CartItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
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

export function addToCart(item: Omit<CartItem, 'quantity'>, quantity = 1): void {
    const items = readCart();
    const existing = items.find(i => i.variantId === item.variantId);
    if (existing) {
        existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity);
    } else {
        items.push({ ...item, quantity: Math.min(MAX_QUANTITY, Math.max(1, quantity)) });
    }
    writeCart(items);
}

export function setQuantity(variantId: string, quantity: number): void {
    const items = readCart();
    const existing = items.find(i => i.variantId === variantId);
    if (!existing) return;
    if (quantity <= 0) {
        writeCart(items.filter(i => i.variantId !== variantId));
        return;
    }
    existing.quantity = Math.min(MAX_QUANTITY, quantity);
    writeCart(items);
}

export function removeFromCart(variantId: string): void {
    writeCart(readCart().filter(i => i.variantId !== variantId));
}

export function clearCart(): void {
    writeCart([]);
}
