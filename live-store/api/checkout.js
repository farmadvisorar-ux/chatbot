import { isConfigured, accessToken, paypal, siteOrigin, json } from './_paypal.js';

/** The one product this storefront sells. Priced here, on the server, only. */
const PRODUCT_NAME = 'I Hope The Worst Tee';
const COLORWAY = 'Washed Black';
const PRICE_CENTS = 3500;

const SIZES = ['S', 'M', 'L', 'XL', '2XL'];
const MAX_QTY_PER_LINE = 9;
const MAX_LINES = 5;

const money = cents => (cents / 100).toFixed(2);

/**
 * POST /api/checkout { items: [{ size, qty }] } -> { url }
 *
 * Opens a PayPal order for the cart and returns the approval URL to send the
 * buyer to. Prices are looked up here and never read from the request: the
 * page is static and anyone can edit what it posts, so the only number that
 * counts is PRICE_CENTS above.
 *
 * Pre-orders are deliberately not accepted. The page used to offer a $20
 * deposit with a $15 balance "emailed later", but nothing ever collected that
 * balance, so the option was removed from the page and is rejected here too.
 */
export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return json(res, 405, { error: 'Method not allowed. Use POST.' });
        }
        if (!isConfigured()) {
            return json(res, 501, { error: 'Checkout is not configured on this deployment yet.' });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
        const rawItems = Array.isArray(body.items) ? body.items : [];
        if (rawItems.length === 0) return json(res, 400, { error: 'Your cart is empty.' });
        if (rawItems.length > MAX_LINES) return json(res, 400, { error: 'Too many items in one order.' });

        // Merge duplicate sizes before clamping, so five separate "size L"
        // lines cannot add up to more than one line is allowed to hold.
        const bySize = new Map();
        for (const item of rawItems) {
            const size = String(item?.size ?? '').trim().toUpperCase();
            if (!SIZES.includes(size)) {
                return json(res, 400, { error: `"${size || 'unknown'}" is not a size we carry.` });
            }
            const qty = Math.trunc(Number(item?.qty));
            if (!Number.isFinite(qty) || qty < 1) {
                return json(res, 400, { error: 'Every item needs a quantity of at least 1.' });
            }
            bySize.set(size, (bySize.get(size) ?? 0) + qty);
        }

        const items = [];
        for (const [size, qty] of bySize) {
            if (qty > MAX_QTY_PER_LINE) {
                return json(res, 400, { error: `Maximum ${MAX_QTY_PER_LINE} per size per order.` });
            }
            items.push({ size, qty });
        }

        const totalCents = items.reduce((sum, item) => sum + item.qty * PRICE_CENTS, 0);
        const origin = siteOrigin(req);
        const token = await accessToken();

        const order = await paypal('/v2/checkout/orders', token, {
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: 'USD',
                    value: money(totalCents),
                    breakdown: {
                        item_total: { currency_code: 'USD', value: money(totalCents) },
                    },
                },
                items: items.map(item => ({
                    name: `${PRODUCT_NAME} — Size ${item.size}`.slice(0, 127),
                    description: COLORWAY,
                    quantity: String(item.qty),
                    unit_amount: { currency_code: 'USD', value: money(PRICE_CENTS) },
                })),
            }],
            payment_source: {
                paypal: {
                    experience_context: {
                        return_url: `${origin}/`,
                        cancel_url: `${origin}/`,
                        // The buyer's PayPal address is the shipping address;
                        // the page never asks for one.
                        shipping_preference: 'GET_FROM_FILE',
                        user_action: 'PAY_NOW',
                    },
                },
            },
        });

        const approval = (order.links ?? []).find(link => link.rel === 'payer-action');
        if (!approval) throw new Error('PayPal did not return an approval link.');

        return json(res, 200, { url: approval.href });
    } catch (err) {
        console.error('[checkout]', err);
        return json(res, 502, { error: 'We could not reach PayPal. Please try again.' });
    }
}
