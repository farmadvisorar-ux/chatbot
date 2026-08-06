import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.ts';
import { json, error, requireMethod, queryParam } from './_lib/http.ts';
import { guarded } from './_lib/errors.ts';
import { generateDailyBatch } from './_lib/leadgen.ts';
import { reminderMessage } from './_lib/messaging.ts';

/**
 * Both scheduled jobs share one function — Vercel's Hobby plan caps a
 * project at 12 serverless functions, and this app only needs two schedules.
 * See .github/workflows/roofsignal-cron.yml: GitHub Actions calls this on a
 * cron since Vercel's own Hobby cron only fires once a day, too coarse for
 * a reminder that has to land near a specific hour mark.
 *
 * GET/POST /api/cron?task=daily-leads  — morning lead drop (idempotent per day)
 * GET/POST /api/cron?task=reminders    — 1-hour-before appointment reminders
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('cron', res, async () => {
        if (!requireMethod(req, res, ['GET', 'POST'])) return;

        const secret = process.env.CRON_SECRET;
        if (!secret) { error(res, 501, 'CRON_SECRET is not configured on this deployment.'); return; }
        if (req.headers.authorization?.replace(/^Bearer\s+/i, '') !== secret) {
            error(res, 401, 'Unauthorized');
            return;
        }
        if (!isDatabaseConfigured()) { error(res, 501, 'The database is not configured on this deployment yet.'); return; }
        const pool = getPool();

        const task = queryParam(req, 'task') || 'daily-leads';

        if (task === 'daily-leads') {
            const existing = await pool.query(`SELECT count(*)::int AS count FROM leads WHERE lead_date = CURRENT_DATE`);
            if (Number(existing.rows[0]?.count ?? 0) > 0) {
                json(res, 200, { ok: true, task, generated: 0, alreadyGeneratedToday: true });
                return;
            }
            const count = Math.floor(Math.random() * 31) + 20; // 20-50
            const batch = await generateDailyBatch(count, pool);
            for (const lead of batch) {
                await pool.query(
                    `INSERT INTO leads (name, phone, address, neighborhood, lat, lng, distance_miles,
                                         roof_age_years, storm_score, insurance_likelihood, storm_event_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [lead.name, lead.phone, lead.address, lead.neighborhood, lead.lat, lead.lng,
                        lead.distanceMiles, lead.roofAgeYears, lead.stormScore, lead.insuranceLikelihood, lead.stormEventId],
                );
            }
            json(res, 200, { ok: true, task, generated: batch.length });
            return;
        }

        if (task === 'reminders') {
            // GitHub Actions runs this every 15 minutes; a +/-10 minute window
            // around the 60-minute mark means a run never misses an appointment
            // that lands between two scheduled invocations.
            const due = await pool.query<{ id: string; leadId: string; name: string; neighborhood: string; stormScore: number }>(
                `SELECT a.id, a.lead_id AS "leadId", l.name, l.neighborhood, l.storm_score AS "stormScore"
                 FROM appointments a
                 JOIN leads l ON l.id = a.lead_id
                 WHERE a.status = 'scheduled' AND a.reminder_sent_at IS NULL
                   AND a.starts_at BETWEEN now() + interval '50 minutes' AND now() + interval '70 minutes'`,
            );

            let sent = 0;
            for (const appt of due.rows) {
                const text = reminderMessage({ name: appt.name, neighborhood: appt.neighborhood, stormScore: appt.stormScore });
                await pool.query(
                    `INSERT INTO messages (lead_id, kind, body) VALUES ($1, 'reminder', $2)`,
                    [appt.leadId, text],
                );
                await pool.query(`UPDATE appointments SET reminder_sent_at = now() WHERE id = $1`, [appt.id]);
                sent += 1;
            }
            json(res, 200, { ok: true, task, sent });
            return;
        }

        error(res, 400, 'Unknown task. Use ?task=daily-leads or ?task=reminders');
    });
}
