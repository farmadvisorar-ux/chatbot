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
 * Branded merch (stickers, tees with designs) should use Printful *sync*
 * variant ids from the store product that already has artwork attached.
 * Catalog variant ids alone produce blank goods unless print files are also
 * supplied — set PRINTFUL_USE_CATALOG_VARIANTS=true only for that path.
 */
export type PrintfulOrderItem =
    | { sync_variant_id: number; quantity: number }
    | { variant_id: number; quantity: number };

export function printfulOrderItem(printfulVariantId: number, quantity: number): PrintfulOrderItem {
    if (process.env.PRINTFUL_USE_CATALOG_VARIANTS === 'true') {
        return { variant_id: printfulVariantId, quantity };
    }
    return { sync_variant_id: printfulVariantId, quantity };
}

export class PrintfulError extends Error {}

/**
 * Submits a fulfillment order to Printful. `externalId` is our order id —
 * Printful stores it back on their side, which is what makes a retry after a
 * network failure safe to send twice: Printful treats a repeated external_id
 * on the same store as the same order rather than fulfilling it again.
 *
 * confirm defaults to true (ships straight to production) unless
 * PRINTFUL_AUTO_CONFIRM=false, in which case the order lands as a draft in
 * the Printful dashboard for a human to approve — useful while still
 * trusting the pipeline.
 */
export async function createPrintfulOrder(
    recipient: PrintfulRecipient,
    items: PrintfulOrderItem[],
    externalId: string,
): Promise<{ id: number }> {
    const apiKey = getPrintfulKey();
    if (!apiKey) throw new PrintfulError('PRINTFUL_API_KEY is not configured');

    const storeId = process.env.PRINTFUL_STORE_ID;
    const url = `${PRINTFUL_API_BASE}/orders${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`;
    const confirm = process.env.PRINTFUL_AUTO_CONFIRM !== 'false';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ external_id: externalId, recipient, items, confirm }),
    });

    const payload = (await response.json().catch(() => null)) as
        | { result?: { id: number }; error?: { message?: string } }
        | null;

    if (!response.ok || !payload?.result) {
        throw new PrintfulError(payload?.error?.message || `Printful order failed (${response.status})`);
    }
    return { id: payload.result.id };
}
