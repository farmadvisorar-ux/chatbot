import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
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
    const a = Buffer.from(expected);
    const b = Buffer.from(header);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

type Shipment = { tracking_number?: string; tracking_url?: string };

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
            data?: {
                shipment?: Shipment;
                order?: { id?: number; external_id?: string; shipments?: Shipment[] };
            };
        };
        try {
            event = JSON.parse(raw.toString('utf8'));
        } catch {
            error(res, 400, 'Invalid JSON');
            return;
        }

        if (event.type === 'package_shipped' && isDatabaseConfigured()) {
            const order = event.data?.order;
            // Official payloads put tracking on data.shipment; older samples
            // nested it under order.shipments[0]. Prefer the documented path.
            const shipment = event.data?.shipment ?? order?.shipments?.[0];
            const externalId = order?.external_id || null;
            const printfulOrderId = typeof order?.id === 'number' ? order.id : null;

            if (externalId || printfulOrderId !== null) {
                // external_id may be our hyphenless UUID (Printful's 32-char
                // limit) or the original hyphenated form.
                await getPool().query(
                    `UPDATE orders
                     SET status = 'shipped', tracking_number = $3, tracking_url = $4
                     WHERE printful_order_id IS NOT NULL
                       AND (
                         ($1::text IS NOT NULL AND (id::text = $1 OR replace(id::text, '-', '') = $1))
                         OR ($2::bigint IS NOT NULL AND printful_order_id = $2)
                       )`,
                    [
                        externalId,
                        printfulOrderId,
                        shipment?.tracking_number || null,
                        shipment?.tracking_url || null,
                    ],
                );
            }
        }

        json(res, 200, { received: true });
    });
}
