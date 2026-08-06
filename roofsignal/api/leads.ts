import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.ts';
import { json, error, requireMethod, queryParam } from './_lib/http.ts';
import { guarded } from './_lib/errors.ts';
import { requireOwner } from './_lib/auth.ts';
import { clean, clamp } from './_lib/validate.ts';
import { generateDailyBatch } from './_lib/leadgen.ts';

const LEAD_COLUMNS = `
    id, name, phone, address, neighborhood, lat, lng,
    distance_miles AS "distanceMiles", roof_age_years AS "roofAgeYears",
    storm_score AS "stormScore", insurance_likelihood AS "insuranceLikelihood",
    status, notes, lead_date AS "leadDate", source, created_at AS "createdAt"
`;

/**
 * GET  /api/leads?status=&date=today   -> list leads, newest/highest-signal first
 * POST /api/leads?action=generate      -> drop today's batch (idempotent per day)
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('leads', res, async () => {
        if (!requireOwner(req, res)) return;
        if (!requireMethod(req, res, ['GET', 'POST'])) return;

        if (!isDatabaseConfigured()) {
            error(res, 501, 'The database is not configured on this deployment yet.');
            return;
        }
        const pool = getPool();

        if (req.method === 'POST') {
            if (queryParam(req, 'action') !== 'generate') {
                error(res, 400, 'Unknown action. Use ?action=generate');
                return;
            }

            const existing = await pool.query(
                `SELECT count(*)::int AS count FROM leads WHERE lead_date = CURRENT_DATE`,
            );
            if (Number(existing.rows[0]?.count ?? 0) > 0) {
                json(res, 200, { ok: true, generated: 0, alreadyGeneratedToday: true });
                return;
            }

            const body = (req.body || {}) as { count?: number };
            const count = Number.isFinite(body.count)
                ? clamp(Math.round(Number(body.count)), 1, 75)
                : Math.floor(Math.random() * 31) + 20; // 20-50, per the daily-drop spec

            const batch = generateDailyBatch(count);
            for (const lead of batch) {
                await pool.query(
                    `INSERT INTO leads (name, phone, address, neighborhood, lat, lng, distance_miles,
                                         roof_age_years, storm_score, insurance_likelihood)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [lead.name, lead.phone, lead.address, lead.neighborhood, lead.lat, lead.lng,
                        lead.distanceMiles, lead.roofAgeYears, lead.stormScore, lead.insuranceLikelihood],
                );
            }
            json(res, 200, { ok: true, generated: batch.length });
            return;
        }

        const status = clean(queryParam(req, 'status'), 24);
        const today = queryParam(req, 'date') === 'today';

        const conditions: string[] = [];
        const params: unknown[] = [];
        if (status) {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }
        if (today) {
            conditions.push(`lead_date = CURRENT_DATE`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(
            `SELECT ${LEAD_COLUMNS} FROM leads ${where}
             ORDER BY lead_date DESC, storm_score DESC, created_at DESC
             LIMIT 500`,
            params,
        );
        json(res, 200, { leads: rows });
    });
}
