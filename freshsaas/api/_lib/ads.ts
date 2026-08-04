/**
 * View packages a self-serve ad can be bought in. Prices are authoritative
 * here, server-side — the client only ever sends a package key, never a
 * price, so a manipulated request body can't change what gets charged.
 */
export type AdPackage = { views: number; priceCents: number; label: string };

export const AD_PACKAGES: Record<string, AdPackage> = {
    '1000': { views: 1_000, priceCents: 900, label: '1,000 views' },
    '5000': { views: 5_000, priceCents: 3_900, label: '5,000 views' },
    '20000': { views: 20_000, priceCents: 12_900, label: '20,000 views' },
};
