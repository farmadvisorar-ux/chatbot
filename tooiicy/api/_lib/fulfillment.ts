import type pg from 'pg';
import { createPrintfulOrder, type PrintfulRecipient } from './printful.js';

/**
 * Sends a paid order to Printful and records the outcome. Never throws: a
 * Printful outage must not stop the caller's own flow (the Stripe webhook
 * responding 200, or an admin's retry request completing) since the money
 * has already moved. A failed attempt lands the order in `fulfillment_error`
 * where /admin.html can retry it once Printful recovers.
 *
 * Shared between the Stripe webhook (first attempt, right after payment) and
 * the admin "retry fulfillment" action (later attempts) so both go through
 * the exact same recipient-building and status logic.
 */
export async function submitToPrintful(pool: pg.Pool, orderId: string): Promise<void> {
    const { rows: orderRows } = await pool.query<{
        shippingName: string | null;
        shippingAddress: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
        email: string | null;
    }>(
        `SELECT shipping_name AS "shippingName", shipping_address AS "shippingAddress", email
         FROM orders WHERE id = $1`,
        [orderId],
    );
    const order = orderRows[0];
    const address = order?.shippingAddress;
    if (!order || !address?.line1 || !address.city || !address.postal_code || !address.country) {
        await pool.query(
            `UPDATE orders SET status = 'fulfillment_error', fulfillment_error = $2 WHERE id = $1`,
            [orderId, 'No shipping address was collected'],
        );
        return;
    }

    const { rows: items } = await pool.query<{ printfulVariantId: string; quantity: number }>(
        `SELECT printful_variant_id AS "printfulVariantId", quantity FROM order_items WHERE order_id = $1`,
        [orderId],
    );

    const recipient: PrintfulRecipient = {
        name: order.shippingName || 'Customer',
        address1: address.line1,
        address2: address.line2 || undefined,
        city: address.city,
        state_code: address.state || undefined,
        country_code: address.country,
        zip: address.postal_code,
        email: order.email || undefined,
    };

    try {
        const printfulOrder = await createPrintfulOrder(
            recipient,
            items.map(item => ({ variant_id: Number(item.printfulVariantId), quantity: item.quantity })),
            orderId,
        );
        await pool.query(
            `UPDATE orders SET status = 'submitted_to_printful', printful_order_id = $2, fulfillment_error = NULL WHERE id = $1`,
            [orderId, printfulOrder.id],
        );
    } catch (err) {
        console.error('[fulfillment] Printful submission failed', err);
        await pool.query(
            `UPDATE orders SET status = 'fulfillment_error', fulfillment_error = $2 WHERE id = $1`,
            [orderId, err instanceof Error ? err.message : 'Unknown error'],
        );
    }
}
