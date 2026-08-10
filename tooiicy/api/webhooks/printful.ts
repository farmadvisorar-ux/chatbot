import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { guarded } from '../_lib/errors.js';
import { validUrl } from '../_lib/validate.js';

/**
 * POST /api/webhooks/printful — receives shipping updates from Printful
 * (Dashboard -> Settings -> Webhooks -> package_shipped).
 *
 * Verified against PRINTFUL_WEBHOOK_SECRET via X-Printful-Signature
 * (HMAC-SHA256 of the raw body). The secret is required in production so a
 * forged event cannot mark orders shipped or inject a tracking URL.
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

function verifySignature(raw: Buffer, header: string | undefined, secret: string): boolean {
    if (!header) return false;
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const left = Buffer.from(header);
    const right = Buffer.from(expected);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

function isProduction(): boolean {
    return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('webhooks/printful', res, async () => {
        if (!requireMethod(req, res, ['POST'])) return;

        const raw = await readRawBody(req);
        const secret = process.env.PRINTFUL_WEBHOOK_SECRET;
        if (!secret) {
            if (isProduction()) {
                error(res, 501, 'Printful webhook secret is not configured');
                return;
            }
        } else {
            const signature = req.headers['x-printful-signature'];
            const ok = verifySignature(raw, typeof signature === 'string' ? signature : undefined, secret);
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
            const trackingUrl = shipment?.tracking_url && validUrl(shipment.tracking_url)
                ? shipment.tracking_url
                : null;
            if (orderId) {
                await getPool().query(
                    `UPDATE orders SET status = 'shipped', tracking_number = $2, tracking_url = $3
                     WHERE id = $1 AND printful_order_id IS NOT NULL`,
                    [orderId, shipment?.tracking_number || null, trackingUrl],
                );
            }
        }

        json(res, 200, { received: true });
    });
}
