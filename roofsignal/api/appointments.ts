import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.ts';
import { json, error, requireMethod, queryParam } from './_lib/http.ts';
import { guarded } from './_lib/errors.ts';
import { requireOwner } from './_lib/auth.ts';

/**
 * GET /api/appointments?range=today|upcoming (default upcoming)
 *
 * Powers the calendar/route view: today's schedule, or everything still
 * scheduled ahead. Cancelled/completed appointments are excluded here — the
 * lead detail view still shows full appointment history for a given lead.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('appointments', res, async () => {
        if (!requireOwner(req, res)) return;
        if (!requireMethod(req, res, ['GET'])) return;
        if (!isDatabaseConfigured()) { error(res, 501, 'The database is not configured on this deployment yet.'); return; }

        const pool = getPool();
        const range = queryParam(req, 'range') || 'upcoming';
        const dateFilter = range === 'today' ? `AND a.starts_at::date = CURRENT_DATE` : `AND a.starts_at >= now() - interval '1 hour'`;

        const { rows } = await pool.query(
            `SELECT a.id, a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.status,
                    l.id AS "leadId", l.name, l.phone, l.address, l.neighborhood, l.lat, l.lng
             FROM appointments a
             JOIN leads l ON l.id = a.lead_id
             WHERE a.status = 'scheduled' ${dateFilter}
             ORDER BY a.starts_at ASC
             LIMIT 200`,
        );
        json(res, 200, { appointments: rows });
    });
}
