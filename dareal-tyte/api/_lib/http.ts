import type { VercelRequest, VercelResponse } from '@vercel/node';

export function json(res: VercelResponse, status: number, data: unknown): void {
    res.status(status).json(data);
}

export function error(res: VercelResponse, status: number, message: string): void {
    res.status(status).json({ success: false, error: message });
}

export function requireMethod(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
    if (!req.method || !methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        error(res, 405, `Method not allowed. Use ${methods.join(' or ')}.`);
        return false;
    }
    return true;
}
