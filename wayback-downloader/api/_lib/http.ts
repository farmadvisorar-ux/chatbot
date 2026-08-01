import type { VercelRequest, VercelResponse } from '@vercel/node';

export function json(res: VercelResponse, status: number, body: unknown): void {
    res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

export function error(res: VercelResponse, status: number, message: string): void {
    json(res, status, { error: message });
}

export function requireMethod(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
    if (!req.method || !methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        error(res, 405, `Method not allowed. Use ${methods.join(' or ')}.`);
        return false;
    }
    return true;
}

/** Parses the JSON body Vercel's Node runtime may hand over as a string. */
export function bodyOf<T>(req: VercelRequest): T {
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body || '{}') as T;
        } catch {
            return {} as T;
        }
    }
    return (req.body ?? {}) as T;
}
