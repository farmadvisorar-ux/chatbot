import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from '../_lib/db.ts';
import { json, error, requireMethod, queryParam } from '../_lib/http.ts';
import { guarded } from '../_lib/errors.ts';
import { clean } from '../_lib/validate.ts';

/**
 * GET /api/summary/:token — the public, unauthenticated endpoint behind the
 * link texted to a homeowner. No APP_SECRET check: the unguessable token
 * (192 bits, see api/leads/[id].ts) *is* the authorization, exactly like the
 * SMS-shareable link the spec calls for. Expired tokens 404 rather than
 * revealing that they ever existed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('summary/[token]', res, async () => {
        if (!requireMethod(req, res, ['GET'])) return;
        if (!isDatabaseConfigured()) { error(res, 501, 'Not configured yet.'); return; }

        const token = clean(queryParam(req, 'token'), 128);
        if (!token) { error(res, 400, 'Missing token'); return; }

        const pool = getPool();
        const { rows } = await pool.query(
            `SELECT s.roof_condition AS "roofCondition", s.storm_analysis AS "stormAnalysis",
                    s.insurance_notes AS "insuranceNotes", s.recommendation, s.notes,
                    s.share_expires_at AS "shareExpiresAt", s.created_at AS "createdAt",
                    l.name AS "homeownerName", l.address, l.neighborhood
             FROM inspection_summaries s
             JOIN leads l ON l.id = s.lead_id
             WHERE s.share_token = $1 AND s.share_expires_at > now()`,
            [token],
        );
        const summary = rows[0];
        if (!summary) { error(res, 404, 'This summary link has expired or does not exist.'); return; }

        const { rows: photos } = await pool.query(
            `SELECT p.url, p.tag FROM photos p
             JOIN inspection_summaries s ON s.lead_id = p.lead_id
             WHERE s.share_token = $1
             ORDER BY p.taken_at DESC LIMIT 24`,
            [token],
        );

        res.setHeader('Cache-Control', 'private, max-age=60');
        json(res, 200, { summary, photos });
    });
}
