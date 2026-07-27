import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_lib/db.js';
import { clean, numberValue, clamp } from './_lib/validate.js';
import { json, error, requireMethod, clientKey } from './_lib/http.js';
import { checkRateLimit } from './_lib/rateLimit.js';

type ProjectBody = {
    name?: string;
    customer?: string;
    value?: string | number;
    status?: string;
    progress?: string | number;
    rfis?: string | number;
    changes?: string | number;
};

const STATUSES = ['Bidding', 'Active', 'Closeout'];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const pool = getPool();

    if (req.method === 'GET') {
        const { rows } = await pool.query(
            `SELECT id, name, customer, value::float8 AS value, status, progress, rfis, changes, created_at AS "createdAt"
             FROM construction_projects ORDER BY created_at DESC LIMIT 100`,
        );
        json(res, 200, { projects: rows });
        return;
    }

    if (!requireMethod(req, res, ['GET', 'POST'])) return;

    if (!(await checkRateLimit(pool, 'construction-projects', clientKey(req), 20, 60))) {
        error(res, 429, 'Too many project changes from this network. Try again later.');
        return;
    }

    const input = (req.body || {}) as ProjectBody;
    const name = clean(input.name, 200);
    const customer = clean(input.customer, 200);
    const value = numberValue(input.value);
    const status = clean(input.status, 20);
    const progress = clamp(numberValue(input.progress), 0, 100);
    const rfis = Math.max(0, Math.round(numberValue(input.rfis)));
    const changes = Math.max(0, Math.round(numberValue(input.changes)));

    if (!name || !customer || !STATUSES.includes(status)) {
        error(res, 400, 'Project name, customer, and valid status are required');
        return;
    }
    if (value < 0) {
        error(res, 400, 'Contract value cannot be negative');
        return;
    }

    const inserted = await pool.query(
        `INSERT INTO construction_projects (name, customer, value, status, progress, rfis, changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, customer, value::float8 AS value, status, progress, rfis, changes, created_at AS "createdAt"`,
        [name, customer, value, status, progress, rfis, changes],
    );
    const project = inserted.rows[0];
    if (!project) {
        error(res, 500, 'Could not save project');
        return;
    }
    json(res, 200, { ok: true, project });
}
