import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from '../_lib/db.js';
import { json, error, requireMethod } from '../_lib/http.js';
import { guarded } from '../_lib/errors.js';
import { fromPrintfulExternalId } from '../_lib/printful.js';
import { validUrl } from '../_lib/validate.js';

/**
 * POST /api/webhooks/printful — receives shipping updates from Printful
 * (Dashboard -> Settings -> Webhooks -> package_shipped).
 *
 * Verified against PRINTFUL_WEBHOOK_SECRET when set. Accepts either
 * X-Printful-Signature or X-Pf-Webhook-Signature. In production a secret is
 * required — unsigned events must not mark orders shipped.
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

function hmacHex(secret: Buffer, raw: Buffer): string {
    return createHmac('sha256', secret).update(raw).digest('hex');
}

function signaturesMatch(header: string, expectedHex: string): boolean {
    const provided = Buffer.from(header.trim().toLowerCase());
    const expected = Buffer.from(expectedHex.toLowerCase());
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
}

function verifySignature(raw: Buffer, header: string | undefined, secret: string): boolean {
    if (!header) return false;

    // Try the secret as UTF-8 text (classic Printful dashboard copy).
    if (signaturesMatch(header, hmacHex(Buffer.from(secret, 'utf8'), raw))) return true;

    // Some Printful webhook docs show the secret as hex-encoded bytes.
    if (/^[0-9a-f]+$/i.test(secret) && secret.length % 2 === 0) {
        try {
            if (signaturesMatch(header, hmacHex(Buffer.from(secret, 'hex'), raw))) return true;
        } catch {
            // ignore invalid hex
        }
    }
    return false;
}

function readSignatureHeader(req: VercelRequest): string | undefined {
    const primary = req.headers['x-printful-signature'];
    const alt = req.headers['x-pf-webhook-signature'];
    if (typeof primary === 'string') return primary;
    if (typeof alt === 'string') return alt;
    return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('webhooks/printful', res, async () => {
        if (!requireMethod(req, res, ['POST'])) return;

        const raw = await readRawBody(req);
        const secret = process.env.PRINTFUL_WEBHOOK_SECRET?.trim();
        const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

        if (!secret) {
            if (isProduction) {
                error(res, 501, 'Printful webhook secret is not configured');
                return;
            }
        } else {
            const ok = verifySignature(raw, readSignatureHeader(req), secret);
            if (!ok) {
                error(res, 400, 'Invalid Printful signature');
                return;
            }
        }

        let event: {
            type?: string;
            data?: {
                order?: {
                    id?: number;
                    external_id?: string;
                    shipments?: { tracking_number?: string; tracking_url?: string }[];
                };
                shipment?: { tracking_number?: string; tracking_url?: string };
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
            const shipment = event.data?.shipment || order?.shipments?.[0];
            const externalId = order?.external_id;
            if (externalId) {
                const orderId = fromPrintfulExternalId(externalId);
                const trackingUrl = shipment?.tracking_url && validUrl(shipment.tracking_url)
                    ? shipment.tracking_url
                    : null;
                await getPool().query(
                    `UPDATE orders SET status = 'shipped', tracking_number = $2, tracking_url = $3
                     WHERE id = $1 AND printful_order_id IS NOT NULL
                       AND status IN ('submitted_to_printful', 'fulfillment_error', 'paid', 'shipped')`,
                    [orderId, shipment?.tracking_number || null, trackingUrl],
                );
            }
        }

        json(res, 200, { received: true });
    });
}
