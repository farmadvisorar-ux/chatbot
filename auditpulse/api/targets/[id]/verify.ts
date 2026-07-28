import type { VercelRequest, VercelResponse } from '@vercel/node';
import { error, json, requireMethod } from '../../_lib/http.js';
import { requireAuth } from '../../_lib/auth.js';
import { getPool } from '../../_lib/db.js';
import { verifyDomainOwnership } from '../../_lib/verification.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const pool = getPool();

    const { rows } = await pool.query('SELECT * FROM targets WHERE id = $1 AND user_id = $2', [id, user.userId]);
    const target = rows[0];
    if (!target) {
        error(res, 404, 'Target not found.');
        return;
    }
    if (target.verified) {
        json(res, 200, { verified: true, method: target.verification_method });
        return;
    }

    const result = await verifyDomainOwnership(target.hostname, target.verification_token);
    if (result.verified) {
        await pool.query(
            'UPDATE targets SET verified = true, verified_at = now(), verification_method = $2 WHERE id = $1',
            [id, result.method],
        );
    }
    json(res, 200, result);
}
