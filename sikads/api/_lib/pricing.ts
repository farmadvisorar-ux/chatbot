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
