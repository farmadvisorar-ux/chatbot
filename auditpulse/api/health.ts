import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from './_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    json(res, 200, { message: 'Success' });
}
