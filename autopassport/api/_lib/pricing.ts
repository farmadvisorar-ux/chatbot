/**
 * The whole business model: a flat, one-time fee to get an app reviewed and,
 * if it actually works from a car's screen, listed with a certified stamp.
 * One number, quoted verbatim on the landing page — changing it changes a
 * public price, not just a constant.
 */
export const CERTIFICATION_FEE_CENTS = 4900; // $49.00 one-time

/**
 * The four kinds of app a driver actually reaches for from behind the wheel.
 * Kept small on purpose — a long category list is a directory nobody browses.
 */
export const CATEGORIES = [
    { value: 'navigation', label: 'Navigation' },
    { value: 'music', label: 'Music & Audio' },
    { value: 'phone_messaging', label: 'Phone & Messaging' },
    { value: 'other', label: 'Other' },
] as const;

export type Category = (typeof CATEGORIES)[number]['value'];

export function isCategory(value: string): value is Category {
    return CATEGORIES.some(c => c.value === value);
}
