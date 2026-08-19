import type { VercelRequest, VercelResponse } from '@vercel/node';

export function json(res: VercelResponse, status: number, data: unknown): void {
    res.status(status).json(data);
}

export function error(res: VercelResponse, status: number, message: string): void {
    res.status(status).json({ error: message });
}

/**
 * True for read requests. HEAD reaches handlers that allow GET (see
 * requireMethod), so any branch that splits read-vs-write must test this
 * rather than `req.method === 'GET'` — otherwise HEAD falls through to the
 * write path and fails validation on an empty body.
 */
export const isRead = (req: VercelRequest): boolean => req.method === 'GET' || req.method === 'HEAD';

export function requireMethod(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
    // RFC 9110 §9.3.2: HEAD is identical to GET but without a response body,
    // so any route that serves GET must also accept HEAD. Rejecting it broke
    // uptime monitors, link checkers, and crawlers, which probe with HEAD.
    // The runtime drops the body for us; handlers need no special casing.
    const allowed = methods.includes('GET') ? [...methods, 'HEAD'] : methods;
    if (!req.method || !allowed.includes(req.method)) {
        res.setHeader('Allow', allowed.join(', '));
        error(res, 405, `Method not allowed. Use ${methods.join(' or ')}.`);
        return false;
    }
    return true;
}

export function clientKey(req: VercelRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0].trim();
    return ip || req.socket?.remoteAddress || 'unknown';
}
