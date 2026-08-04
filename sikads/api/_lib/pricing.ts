/**
 * Advertisers set their own price per 1,000 views rather than picking from
 * fixed packages. These bounds are the only thing enforced server-side —
 * everything between the floor and ceiling is the advertiser's choice.
 */
export const MIN_CPM_CENTS = 100;      // $1.00 per 1,000 views
export const MAX_CPM_CENTS = 10_000;   // $100.00 per 1,000 views
export const MIN_BUDGET_CENTS = 500;   // $5 minimum spend
export const MAX_BUDGET_CENTS = 500_000; // $5,000 sanity ceiling

/** Views purchased = budget / (cpm / 1000), floored to a whole view. */
export function computeViews(budgetCents: number, cpmCents: number): number {
    return Math.floor((budgetCents / cpmCents) * 1000);
}

/**
 * Share of an advertiser's spend paid back to the publisher who served the
 * view. The rest is platform revenue. Deliberately set against the going rate
 * in this category — chatwait pays 50%, so 40% is the number this business is
 * built around and is quoted verbatim on the landing page. Changing it changes
 * a public promise, not just a constant.
 */
export const PUBLISHER_SHARE_PERCENT = 40;

/**
 * What one view earns its publisher, in microcents (1 cent = 1,000 microcents).
 *
 * A view is worth cpm/1000 to us, of which the publisher takes their share —
 * at a $5.00 CPM that is 0.2 cents, a figure integer cents would round to zero
 * and lose entirely. Working in microcents keeps every impression countable and
 * defers rounding to payout time, when whole cents actually matter.
 */
export function publisherMicrocentsPerView(cpmCents: number): number {
    return Math.round((cpmCents * PUBLISHER_SHARE_PERCENT) / 100);
}

/** Microcents -> whole cents, for display and payout. */
export function microcentsToCents(microcents: number): number {
    return Math.floor(microcents / 1000);
}
