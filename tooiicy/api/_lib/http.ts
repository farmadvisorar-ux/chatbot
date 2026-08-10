import { timingSafeEqual } from 'node:crypto';
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

/** Constant-time string compare for secrets of equal length. */
export function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}

/** True when the bearer token matches ADMIN_SECRET. False (never throws) if ADMIN_SECRET isn't configured. */
export function isAdmin(req: VercelRequest): boolean {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return false;
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    return safeEqual(token, secret);
}
