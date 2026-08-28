import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { guarded } from '../_lib/errors.js';

/**
 * POST /api/webhooks/printful — receives shipping updates from Printful
 * (Dashboard -> Settings -> Webhooks -> package_shipped).
 *
 * Verified against PRINTFUL_WEBHOOK_SECRET when set, via the header Printful
 * documents for this (X-Printful-Signature, an HMAC-SHA256 of the raw body
 * using the secret shown next to the webhook in the dashboard). Without a
 * secret configured, events are still accepted but unauthenticated — the
 * worst an attacker can do with a forged event is mark a real order id as
 * shipped, which is a cosmetic status and not a money-moving one, so this
 * degrades gracefully rather than refusing to run.
 */
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function verifySignature(raw: Buffer, header: string | undefined, secret: string): Promise<boolean> {
    if (!header) return false;
    const { createHmac } = await import('node:crypto');
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    return header === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('webhooks/printful', res, async () => {
        if (!requireMethod(req, res, ['POST'])) return;

        const raw = await readRawBody(req);
        const secret = process.env.PRINTFUL_WEBHOOK_SECRET;
        if (secret) {
            const signature = req.headers['x-printful-signature'];
            const ok = await verifySignature(raw, typeof signature === 'string' ? signature : undefined, secret);
            if (!ok) {
                error(res, 400, 'Invalid Printful signature');
                return;
            }
        }

        let event: {
            type?: string;
            data?: { order?: { id?: number; external_id?: string; shipments?: { tracking_number?: string; tracking_url?: string }[] } };
        };
        try {
            event = JSON.parse(raw.toString('utf8'));
        } catch {
            error(res, 400, 'Invalid JSON');
            return;
        }

        if (event.type === 'package_shipped' && isDatabaseConfigured()) {
            const order = event.data?.order;
            const shipment = order?.shipments?.[0];
            const orderId = order?.external_id;
            if (orderId) {
                await getPool().query(
                    `UPDATE orders SET status = 'shipped', tracking_number = $2, tracking_url = $3
                     WHERE id = $1 AND printful_order_id IS NOT NULL`,
                    [orderId, shipment?.tracking_number || null, shipment?.tracking_url || null],
                );
            }
        }

        json(res, 200, { received: true });
    });
}
