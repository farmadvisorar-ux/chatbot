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
 * Printful store products (with designs) need `sync_variant_id`. Blank catalog
 * products need `variant_id` (+ files). This store is branded merch, so sync
 * variants are the default; set PRINTFUL_USE_CATALOG_VARIANTS=true only when
 * fulfilling blank catalog SKUs.
 */
export type PrintfulOrderItem = { id: number; quantity: number };

export class PrintfulError extends Error {}

/**
 * Printful caps `external_id` at 32 characters. Our order ids are UUIDs
 * (36 with hyphens); stripping hyphens yields exactly 32 hex chars and stays
 * reversible for webhook lookups.
 */
export function toPrintfulExternalId(orderId: string): string {
    return orderId.replace(/-/g, '').slice(0, 32);
}

/** Reverse of toPrintfulExternalId for webhook payloads that echo external_id. */
export function fromPrintfulExternalId(externalId: string): string {
    const raw = externalId.trim();
    if (/^[0-9a-f]{32}$/i.test(raw)) {
        return [
            raw.slice(0, 8),
            raw.slice(8, 12),
            raw.slice(12, 16),
            raw.slice(16, 20),
            raw.slice(20),
        ].join('-');
    }
    return raw;
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
 * trusting the pipeline. Printful reads confirm from the query string, not
 * the JSON body.
 */
export async function createPrintfulOrder(
    recipient: PrintfulRecipient,
    items: PrintfulOrderItem[],
    externalId: string,
): Promise<{ id: number }> {
    const apiKey = getPrintfulKey();
    if (!apiKey) throw new PrintfulError('PRINTFUL_API_KEY is not configured');

    const storeId = process.env.PRINTFUL_STORE_ID;
    const confirm = process.env.PRINTFUL_AUTO_CONFIRM !== 'false';
    const useCatalog = process.env.PRINTFUL_USE_CATALOG_VARIANTS === 'true';

    const params = new URLSearchParams();
    if (storeId) params.set('store_id', storeId);
    if (confirm) params.set('confirm', '1');
    const query = params.toString();
    const url = `${PRINTFUL_API_BASE}/orders${query ? `?${query}` : ''}`;

    const printfulItems = items.map(item =>
        useCatalog
            ? { variant_id: item.id, quantity: item.quantity }
            : { sync_variant_id: item.id, quantity: item.quantity },
    );

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            external_id: toPrintfulExternalId(externalId),
            recipient,
            items: printfulItems,
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
