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
export type CartLine = { variantId: string; quantity: number };

/** Clamps a requested quantity into the sellable range. Never trust the client's number as-is — it becomes the line item Stripe charges. */
export const clampQuantity = (value: number): number => {
    const whole = Math.trunc(value);
    return Math.min(MAX_QUANTITY_PER_ITEM, Math.max(1, Number.isFinite(whole) ? whole : 1));
};

/**
 * Collapse duplicate variant lines and re-clamp the merged quantity. The
 * browser cart merges by variantId, but a crafted POST can send the same
 * id twice to sneak past the per-item cap — merge first so the cap holds.
 */
export const mergeCartLines = (lines: CartLine[]): CartLine[] => {
    const merged = new Map<string, number>();
    for (const line of lines) {
        const prev = merged.get(line.variantId) ?? 0;
        merged.set(line.variantId, clampQuantity(prev + line.quantity));
    }
    return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
};

export const subtotalCents = (items: PricedItem[]): number =>
    items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

/** Flat domestic shipping in cents; matches SHIPPING_FLAT_CENTS / checkout. */
export const shippingFlatCents = (): number =>
    Math.max(0, Math.trunc(Number(process.env.SHIPPING_FLAT_CENTS) || 500));
