import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Wraps a handler so an uncaught exception (e.g. a missing Blob token)
 * comes back as a readable JSON error instead of Vercel's raw
 * FUNCTION_INVOCATION_FAILED crash page. */
export function withErrorHandling(
    handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
    return async (req, res) => {
        try {
            await handler(req, res);
        } catch (err) {
            console.error(err);
            if (!res.headersSent) {
                error(res, 500, `Unexpected server error: ${(err as Error).message || String(err)}`);
            }
        }
    };
}

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
