import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { error } from './http.js';

/**
 * Every route in this engine spends real money and quota on the caller's
 * behalf (Wayback fetches, Vercel deployments, domain attachments), so an
 * open endpoint is a direct abuse/cost vector. Requests must present the
 * shared secret from DAREAL_API_KEY; if that secret isn't configured, every
 * request is rejected rather than silently allowed through.
 */
export function requireApiKey(req: VercelRequest, res: VercelResponse): boolean {
    const expected = process.env.DAREAL_API_KEY;
    if (!expected) {
        error(res, 501, 'This deployment has not configured DAREAL_API_KEY yet.');
        return false;
    }

    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    const apiKeyHeader = req.headers['x-api-key'];
    const provided = bearer ?? (Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader);

    if (!provided || !safeEqual(provided, expected)) {
        error(res, 401, 'Missing or invalid API key.');
        return false;
    }

    return true;
}

function safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}
