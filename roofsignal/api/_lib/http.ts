import type { VercelRequest, VercelResponse } from '@vercel/node';

export function json(res: VercelResponse, status: number, data: unknown): void {
    res.status(status).json(data);
}

export function error(res: VercelResponse, status: number, message: string): void {
    res.status(status).json({ error: message });
}

export function requireMethod(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
    if (!req.method || !methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
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

export function queryParam(req: VercelRequest, name: string): string {
    const value = req.query[name];
    return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';
}
