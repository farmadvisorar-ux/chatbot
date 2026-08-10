const PRINTFUL_API_BASE = 'https://api.printful.com';

/** Returns the API key, or null when Printful isn't configured yet so callers can report that instead of crashing. */
export function getPrintfulKey(): string | null {
    return process.env.PRINTFUL_API_KEY || null;
}

export type PrintfulRecipient = {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state_code?: string;
    country_code: string;
    zip: string;
    email?: string;
};

/**
 * Store sync variant id (from Printful Dashboard → store product → variant),
 * not a bare catalog variant id. Catalog variants need print files; sync
 * variants already carry the design from the store product.
 */
export type PrintfulOrderItem = { sync_variant_id: number; quantity: number };

export class PrintfulError extends Error {}

/**
 * Printful caps external_id at 32 characters. A hyphenated UUID is 36, so
 * strip the hyphens (32 hex chars) before sending — otherwise every create
 * order call is rejected and paid checkouts never fulfill.
 */
export function toPrintfulExternalId(orderId: string): string {
    return orderId.replace(/-/g, '');
}

/**
 * Submits a fulfillment order to Printful. `externalId` is our order id —
 * Printful stores it back on their side, which is what makes a retry after a
 * network failure safe to send twice: Printful treats a repeated external_id
 * on the same store as the same order rather than fulfilling it again.
 *
 * confirm defaults to true (ships straight to production) unless
 * PRINTFUL_AUTO_CONFIRM=false, in which case the order lands as a draft in
 * the Printful dashboard for a human to approve — useful while still
 * trusting the pipeline. Printful expects confirm as a query param, not in
 * the JSON body.
 */
export async function createPrintfulOrder(
    recipient: PrintfulRecipient,
    items: PrintfulOrderItem[],
    externalId: string,
): Promise<{ id: number }> {
    const apiKey = getPrintfulKey();
    if (!apiKey) throw new PrintfulError('PRINTFUL_API_KEY is not configured');

    const params = new URLSearchParams();
    const storeId = process.env.PRINTFUL_STORE_ID;
    if (storeId) params.set('store_id', storeId);
    if (process.env.PRINTFUL_AUTO_CONFIRM !== 'false') params.set('confirm', '1');

    const query = params.toString();
    const url = `${PRINTFUL_API_BASE}/orders${query ? `?${query}` : ''}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            external_id: toPrintfulExternalId(externalId),
            recipient,
            items,
        }),
    });

    const payload = (await response.json().catch(() => null)) as
        | { result?: { id: number }; error?: { message?: string } }
        | null;

    if (!response.ok || !payload?.result) {
        throw new PrintfulError(payload?.error?.message || `Printful order failed (${response.status})`);
    }
    return { id: payload.result.id };
}
