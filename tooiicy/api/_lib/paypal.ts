const PAYPAL_API = process.env.PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

    const clientId = process.env.PAYPAL_CLIENT_ID!;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET!;
    const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
    const data = await res.json() as { access_token: string; expires_in: number };
    cachedToken = { value: data.access_token, expiresAt: now + data.expires_in * 1000 };
    return cachedToken.value;
}

export function isPayPalConfigured(): boolean {
    return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function siteOrigin(): string {
    return process.env.PUBLIC_SITE_URL || 'https://tooiicy.com';
}

function cents(amount: number): string {
    return (amount / 100).toFixed(2);
}

type OrderItem = { name: string; quantity: number; unitPriceCents: number };

export async function createPayPalOrder(opts: {
    items: OrderItem[];
    shippingCents: number;
    totalCents: number;
    returnUrl: string;
    cancelUrl: string;
}): Promise<{ orderId: string; approvalUrl: string }> {
    const token = await getAccessToken();
    const itemTotal = opts.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

    const body = {
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'USD',
                value: cents(opts.totalCents),
                breakdown: {
                    item_total: { currency_code: 'USD', value: cents(itemTotal) },
                    shipping: { currency_code: 'USD', value: cents(opts.shippingCents) },
                },
            },
            items: opts.items.map(i => ({
                name: i.name.slice(0, 127),
                quantity: String(i.quantity),
                unit_amount: { currency_code: 'USD', value: cents(i.unitPriceCents) },
            })),
        }],
        payment_source: {
            paypal: {
                experience_context: {
                    return_url: opts.returnUrl,
                    cancel_url: opts.cancelUrl,
                    shipping_preference: 'GET_FROM_FILE',
                    user_action: 'PAY_NOW',
                },
            },
        },
    };

    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`PayPal create order failed ${res.status}: ${text}`);
    }
    const data = await res.json() as { id: string; links: { href: string; rel: string }[] };
    const approvalUrl = data.links.find(l => l.rel === 'payer-action')?.href;
    if (!approvalUrl) throw new Error('PayPal did not return an approval URL');
    return { orderId: data.id, approvalUrl };
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<{
    captureId: string;
    payerEmail: string | null;
    shippingName: string | null;
    shippingAddress: object | null;
}> {
    const token = await getAccessToken();
    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`PayPal capture failed ${res.status}: ${text}`);
    }
    const data = await res.json() as {
        id: string;
        status: string;
        purchase_units: Array<{ payments: { captures: Array<{ id: string }> } }>;
        payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
        payment_source?: { paypal?: { address?: object } };
    };

    const capture = data.purchase_units[0]?.payments.captures[0];
    if (!capture || data.status !== 'COMPLETED') {
        throw new Error(`PayPal order status: ${data.status}`);
    }

    const payerName = data.payer?.name;
    const shippingName = payerName
        ? `${payerName.given_name ?? ''} ${payerName.surname ?? ''}`.trim() || null
        : null;
    const shippingAddress = (data.payment_source?.paypal?.address ?? null) as object | null;

    return {
        captureId: capture.id,
        payerEmail: data.payer?.email_address ?? null,
        shippingName,
        shippingAddress,
    };
}

export async function verifyPayPalWebhook(opts: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    webhookId: string;
}): Promise<boolean> {
    try {
        const token = await getAccessToken();
        const h = opts.headers;
        const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_algo: h['paypal-auth-algo'],
                cert_url: h['paypal-cert-url'],
                transmission_id: h['paypal-transmission-id'],
                transmission_sig: h['paypal-transmission-sig'],
                transmission_time: h['paypal-transmission-time'],
                webhook_id: opts.webhookId,
                webhook_event: opts.body,
            }),
        });
        if (!res.ok) return false;
        const data = await res.json() as { verification_status: string };
        return data.verification_status === 'SUCCESS';
    } catch {
        return false;
    }
}
