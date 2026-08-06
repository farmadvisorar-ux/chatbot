import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isDatabaseConfigured, getPool } from './_lib/db.ts';
import { json } from './_lib/http.ts';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!isDatabaseConfigured()) {
        json(res, 200, { ok: true, database: 'not configured' });
        return;
    }
    try {
        await getPool().query('SELECT 1');
        json(res, 200, {
            ok: true,
            database: 'connected',
            appSecretSet: Boolean(process.env.APP_SECRET),
            cronSecretSet: Boolean(process.env.CRON_SECRET),
            blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        });
    } catch {
        json(res, 200, { ok: true, database: 'unreachable' });
    }
}
