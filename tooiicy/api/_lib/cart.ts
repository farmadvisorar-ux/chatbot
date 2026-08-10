/**
 * Pure math for turning a cart into a price. Kept free of the database and
 * Stripe so tests/cart.test.mjs can check the arithmetic directly — this is
 * the code that decides what a real customer is charged.
 */

/** Per line item. Above this, someone is not buying merch for themselves. */
export const MAX_QUANTITY_PER_ITEM = 10;

/** Distinct variants in one order. */
export const MAX_LINE_ITEMS = 20;

export type PricedItem = { unitPriceCents: number; quantity: number };

/** Clamps a requested quantity into the sellable range. Never trust the client's number as-is — it becomes the line item Stripe charges. */
export const clampQuantity = (value: number): number => {
    const whole = Math.trunc(value);
    return Math.min(MAX_QUANTITY_PER_ITEM, Math.max(1, Number.isFinite(whole) ? whole : 1));
};

export const subtotalCents = (items: PricedItem[]): number =>
    items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

/** Merge lines that share a key, clamping each merged quantity. */
export function mergeQuantitiesByKey<T extends { quantity: number }>(
    items: T[],
    keyOf: (item: T) => string,
): T[] {
    const merged = new Map<string, T>();
    for (const item of items) {
        const key = keyOf(item);
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, { ...item, quantity: clampQuantity(item.quantity) });
            continue;
        }
        existing.quantity = clampQuantity(existing.quantity + item.quantity);
    }
    return [...merged.values()];
}
