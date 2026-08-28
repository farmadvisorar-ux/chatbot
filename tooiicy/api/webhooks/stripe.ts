import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, requireMethod } from '../_lib/http.js';

// Stripe has been replaced with PayPal. This endpoint is kept as a stub so
// that old webhook URLs return a clear error rather than a 404.
export default function handler(req: VercelRequest, res: VercelResponse): void {
    if (!requireMethod(req, res, ['POST'])) return;
    error(res, 501, 'Stripe is no longer configured — use PayPal');
}
