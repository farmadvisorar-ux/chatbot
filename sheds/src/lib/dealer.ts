/**
 * Everything about *this dealer*, in one file.
 *
 * The site is built from a supplier's catalogue but it is not the supplier's
 * site — it is a dealer's, and the two get confused easily. Keeping the
 * dealer's identity, territory, phone number and margin here means none of it
 * is scattered through markup, and a second dealer could run the same code by
 * editing this file alone.
 *
 * Every value marked TODO is a placeholder that must be replaced before the
 * site goes in front of a customer. They are wrong on purpose rather than
 * plausible on purpose: a made-up phone number that looks real is worse than
 * an obvious blank, because it ships.
 */
export const DEALER = {
    /** TODO: the dealer's trading name. */
    name: 'Your Shed Company',
    /** TODO: the dealer's own domain. */
    siteUrl: 'https://example.com',

    /** TODO: the number that actually rings. */
    phone: '(000) 000-0000',
    /** TODO: the inbox a lead should land in. */
    email: 'sales@example.com',

    /** TODO: the lot address, or delete if the dealer has no lot. */
    address: { street: '', city: '', state: '', zip: '' },

    /** Counties or states served, shown on the page and used in the copy. */
    territory: [] as string[],

    hours: 'Mon–Sat, 8am–6pm',

    /**
     * The supplier whose buildings this dealer sells.
     *
     * Named openly on the site. A dealer site that hides the manufacturer
     * reads as a drop-shipper, and buyers of $9,000 buildings check — the
     * brand is a reason to trust the product, not something to bury.
     */
    supplier: {
        name: 'Infinite Sheds',
        blurb: 'Amish-built in Lancaster County, Pennsylvania',
    },
} as const;

/**
 * What the dealer charges relative to the supplier's listed price.
 *
 * 0 means the supplier's price is shown unchanged, which is the only
 * defensible default: a made-up margin would put wrong numbers in front of
 * customers on day one, and a dealer who has not set this yet is better
 * served by accurate supplier pricing than by a guess.
 *
 * Whatever is set here applies to every building. Per-building overrides
 * belong in the catalogue, not in a global.
 */
export const MARKUP_PERCENT = 0;

/** Applies the dealer's margin. Integer cents in, integer cents out. */
export function dealerPriceCents(supplierCents: number): number {
    return Math.round(supplierCents * (1 + MARKUP_PERCENT / 100));
}

/** `$4,226` — no cents, because no building in the catalogue has any. */
export function formatPrice(cents: number): string {
    return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
