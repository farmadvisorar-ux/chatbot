import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from '../_lib/db.ts';
import { json, error, requireMethod, queryParam } from '../_lib/http.ts';
import { guarded } from '../_lib/errors.ts';
import { requireOwner } from '../_lib/auth.ts';
import { clean, isUuid } from '../_lib/validate.ts';
import { followUpMessage, confirmationMessage, reminderMessage, summaryLinkMessage } from '../_lib/messaging.ts';
import { draftSummary, shareExpiry } from '../_lib/summary.ts';
import { storePhoto, isConfigured as blobConfigured } from '../_lib/photos.ts';
import { findNextSlot } from '../_lib/scheduling.ts';

const LEAD_COLUMNS = `
    id, name, phone, address, neighborhood, lat, lng,
    distance_miles AS "distanceMiles", roof_age_years AS "roofAgeYears",
    storm_score AS "stormScore", insurance_likelihood AS "insuranceLikelihood",
    status, notes, lead_date AS "leadDate", source, created_at AS "createdAt"
`;

type Lead = {
    id: string; name: string; phone: string; address: string; neighborhood: string;
    stormScore: number; insuranceLikelihood: number; roofAgeYears: number; status: string;
};

const STATUSES = ['new', 'interested', 'needs_inspection', 'booked', 'not_interested'];
const CALL_OUTCOMES = ['answered', 'no_answer', 'voicemail', 'callback_requested'];
const PHOTO_TAGS = ['storm', 'age', 'insurance', 'general'];

async function loadLead(pool: ReturnType<typeof getPool>, id: string): Promise<Lead | null> {
    const { rows } = await pool.query(`SELECT ${LEAD_COLUMNS} FROM leads WHERE id = $1`, [id]);
    return rows[0] ?? null;
}

async function handleGet(pool: ReturnType<typeof getPool>, res: VercelResponse, id: string): Promise<void> {
    const lead = await loadLead(pool, id);
    if (!lead) { error(res, 404, 'Lead not found'); return; }

    const [calls, messages, appointments, photos, summaries] = await Promise.all([
        pool.query(`SELECT id, outcome, notes, created_at AS "createdAt" FROM call_logs
                    WHERE lead_id = $1 ORDER BY created_at DESC`, [id]),
        pool.query(`SELECT id, kind, body, status, created_at AS "createdAt" FROM messages
                    WHERE lead_id = $1 ORDER BY created_at DESC`, [id]),
        pool.query(`SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", status,
                           reminder_sent_at AS "reminderSentAt", created_at AS "createdAt"
                    FROM appointments WHERE lead_id = $1 ORDER BY starts_at DESC`, [id]),
        pool.query(`SELECT id, url, tag, taken_at AS "takenAt" FROM photos
                    WHERE lead_id = $1 ORDER BY taken_at DESC`, [id]),
        pool.query(`SELECT id, roof_condition AS "roofCondition", storm_analysis AS "stormAnalysis",
                           insurance_notes AS "insuranceNotes", recommendation, notes,
                           share_token AS "shareToken", share_expires_at AS "shareExpiresAt",
                           created_at AS "createdAt"
                    FROM inspection_summaries WHERE lead_id = $1 ORDER BY created_at DESC`, [id]),
    ]);

    json(res, 200, {
        lead, calls: calls.rows, messages: messages.rows,
        appointments: appointments.rows, photos: photos.rows, summaries: summaries.rows,
    });
}

async function handlePatch(pool: ReturnType<typeof getPool>, req: VercelRequest, res: VercelResponse, id: string): Promise<void> {
    const body = (req.body || {}) as { status?: string; notes?: string };
    const sets: string[] = [];
    const params: unknown[] = [id];

    if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) {
            error(res, 400, `status must be one of: ${STATUSES.join(', ')}`);
            return;
        }
        params.push(body.status);
        sets.push(`status = $${params.length}`);
    }
    if (body.notes !== undefined) {
        params.push(clean(body.notes, 4000));
        sets.push(`notes = $${params.length}`);
    }
    if (!sets.length) { error(res, 400, 'Provide status and/or notes'); return; }

    const { rows } = await pool.query(
        `UPDATE leads SET ${sets.join(', ')} WHERE id = $1 RETURNING ${LEAD_COLUMNS}`,
        params,
    );
    if (!rows[0]) { error(res, 404, 'Lead not found'); return; }
    json(res, 200, { lead: rows[0] });
}

async function handleCall(pool: ReturnType<typeof getPool>, req: VercelRequest, res: VercelResponse, lead: Lead): Promise<void> {
    const body = (req.body || {}) as { outcome?: string; notes?: string };
    if (!body.outcome || !CALL_OUTCOMES.includes(body.outcome)) {
        error(res, 400, `outcome must be one of: ${CALL_OUTCOMES.join(', ')}`);
        return;
    }
    const notes = clean(body.notes, 2000);
    const inserted = await pool.query(
        `INSERT INTO call_logs (lead_id, outcome, notes) VALUES ($1, $2, $3)
         RETURNING id, outcome, notes, created_at AS "createdAt"`,
        [lead.id, body.outcome, notes],
    );

    let autoMessage = null;
    if (body.outcome === 'no_answer' || body.outcome === 'voicemail') {
        const text = followUpMessage(lead);
        const msg = await pool.query(
            `INSERT INTO messages (lead_id, kind, body) VALUES ($1, 'follow_up', $2)
             RETURNING id, kind, body, status, created_at AS "createdAt"`,
            [lead.id, text],
        );
        autoMessage = msg.rows[0];
    }
    json(res, 200, { call: inserted.rows[0], autoMessage });
}

async function handleMessage(pool: ReturnType<typeof getPool>, req: VercelRequest, res: VercelResponse, lead: Lead): Promise<void> {
    const body = (req.body || {}) as { kind?: string; body?: string };
    const kinds = ['follow_up', 'confirmation', 'reminder', 'summary_link', 'manual'];
    const kind = body.kind && kinds.includes(body.kind) ? body.kind : 'manual';

    let text: string;
    if (kind === 'manual') {
        text = clean(body.body, 1000);
        if (!text) { error(res, 400, 'Provide body for a manual message'); return; }
    } else if (kind === 'follow_up') {
        text = followUpMessage(lead);
    } else if (kind === 'reminder') {
        text = reminderMessage(lead);
    } else if (kind === 'confirmation') {
        text = confirmationMessage(lead, clean(body.body, 200) || 'soon');
    } else {
        error(res, 400, 'Use ?resource=summary to generate a summary_link message');
        return;
    }

    const inserted = await pool.query(
        `INSERT INTO messages (lead_id, kind, body) VALUES ($1, $2, $3)
         RETURNING id, kind, body, status, created_at AS "createdAt"`,
        [lead.id, kind, text],
    );
    json(res, 200, { message: inserted.rows[0] });
}

async function handlePhoto(pool: ReturnType<typeof getPool>, req: VercelRequest, res: VercelResponse, lead: Lead): Promise<void> {
    if (!blobConfigured()) {
        error(res, 501, 'Photo storage is not configured on this deployment yet (BLOB_READ_WRITE_TOKEN missing).');
        return;
    }
    const body = (req.body || {}) as { dataUrl?: string; tag?: string };
    if (!body.dataUrl) { error(res, 400, 'Provide dataUrl (a data: URL from the camera/file input)'); return; }
    const tag = body.tag && PHOTO_TAGS.includes(body.tag) ? body.tag : 'general';

    let url: string;
    try {
        url = await storePhoto(lead.id, body.dataUrl);
    } catch (err) {
        error(res, 400, err instanceof Error ? err.message : 'Could not store photo');
        return;
    }

    const inserted = await pool.query(
        `INSERT INTO photos (lead_id, url, tag) VALUES ($1, $2, $3)
         RETURNING id, url, tag, taken_at AS "takenAt"`,
        [lead.id, url, tag],
    );
    json(res, 200, { photo: inserted.rows[0] });
}

async function handleAppointment(pool: ReturnType<typeof getPool>, req: VercelRequest, res: VercelResponse, lead: Lead): Promise<void> {
    const body = (req.body || {}) as { startsAt?: string };
    let start: Date; let end: Date;

    if (body.startsAt) {
        const requested = new Date(body.startsAt);
        if (Number.isNaN(requested.getTime())) { error(res, 400, 'startsAt is not a valid date'); return; }
        end = new Date(requested.getTime() + 60 * 60 * 1000);
        const conflict = await pool.query(
            `SELECT 1 FROM appointments WHERE status = 'scheduled' AND starts_at < $2 AND ends_at > $1 LIMIT 1`,
            [requested.toISOString(), end.toISOString()],
        );
        if (conflict.rows.length) { error(res, 409, 'That slot is already booked'); return; }
        start = requested;
    } else {
        const slot = await findNextSlot(pool);
        start = slot.start; end = slot.end;
    }

    const inserted = await pool.query(
        `INSERT INTO appointments (lead_id, starts_at, ends_at) VALUES ($1, $2, $3)
         RETURNING id, starts_at AS "startsAt", ends_at AS "endsAt", status, created_at AS "createdAt"`,
        [lead.id, start.toISOString(), end.toISOString()],
    );
    await pool.query(`UPDATE leads SET status = 'booked' WHERE id = $1`, [lead.id]);

    const whenLabel = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(start);
    const text = confirmationMessage(lead, whenLabel);
    const msg = await pool.query(
        `INSERT INTO messages (lead_id, kind, body) VALUES ($1, 'confirmation', $2)
         RETURNING id, kind, body, status, created_at AS "createdAt"`,
        [lead.id, text],
    );

    json(res, 200, { appointment: inserted.rows[0], confirmationMessage: msg.rows[0] });
}

async function handleAppointmentStatus(pool: ReturnType<typeof getPool>, req: VercelRequest, res: VercelResponse, lead: Lead): Promise<void> {
    const body = (req.body || {}) as { appointmentId?: string; status?: string };
    const statuses = ['scheduled', 'completed', 'cancelled'];
    if (!body.appointmentId || !isUuid(body.appointmentId) || !body.status || !statuses.includes(body.status)) {
        error(res, 400, `Provide appointmentId and status (one of: ${statuses.join(', ')})`);
        return;
    }
    const { rows } = await pool.query(
        `UPDATE appointments SET status = $3 WHERE id = $2 AND lead_id = $1
         RETURNING id, starts_at AS "startsAt", ends_at AS "endsAt", status`,
        [lead.id, body.appointmentId, body.status],
    );
    if (!rows[0]) { error(res, 404, 'Appointment not found'); return; }
    json(res, 200, { appointment: rows[0] });
}

async function handleSummary(pool: ReturnType<typeof getPool>, req: VercelRequest, res: VercelResponse, lead: Lead): Promise<void> {
    const body = (req.body || {}) as { notes?: string };
    const draft = draftSummary(lead as unknown as Parameters<typeof draftSummary>[0], clean(body.notes, 3000));
    const shareToken = randomBytes(24).toString('base64url');
    const expiresAt = shareExpiry();

    const inserted = await pool.query(
        `INSERT INTO inspection_summaries
            (lead_id, roof_condition, storm_analysis, insurance_notes, recommendation, notes, share_token, share_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, roof_condition AS "roofCondition", storm_analysis AS "stormAnalysis",
                   insurance_notes AS "insuranceNotes", recommendation, notes,
                   share_token AS "shareToken", share_expires_at AS "shareExpiresAt", created_at AS "createdAt"`,
        [lead.id, draft.roofCondition, draft.stormAnalysis, draft.insuranceNotes, draft.recommendation,
            clean(body.notes, 3000), shareToken, expiresAt.toISOString()],
    );

    const siteUrl = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const shareUrl = `${siteUrl}/s/${shareToken}`;
    const linkText = summaryLinkMessage(lead, shareUrl);
    const msg = await pool.query(
        `INSERT INTO messages (lead_id, kind, body) VALUES ($1, 'summary_link', $2)
         RETURNING id, kind, body, status, created_at AS "createdAt"`,
        [lead.id, linkText],
    );

    json(res, 200, { summary: inserted.rows[0], shareUrl, linkMessage: msg.rows[0] });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('leads/[id]', res, async () => {
        if (!requireOwner(req, res)) return;
        if (!requireMethod(req, res, ['GET', 'PATCH', 'POST'])) return;
        if (!isDatabaseConfigured()) { error(res, 501, 'The database is not configured on this deployment yet.'); return; }

        const id = queryParam(req, 'id');
        if (!isUuid(id)) { error(res, 400, 'Invalid lead id'); return; }
        const pool = getPool();

        if (req.method === 'GET') { await handleGet(pool, res, id); return; }
        if (req.method === 'PATCH') { await handlePatch(pool, req, res, id); return; }

        // POST: every sub-action needs the lead loaded first.
        const lead = await loadLead(pool, id);
        if (!lead) { error(res, 404, 'Lead not found'); return; }

        const resource = queryParam(req, 'resource');
        if (resource === 'call') { await handleCall(pool, req, res, lead); return; }
        if (resource === 'message') { await handleMessage(pool, req, res, lead); return; }
        if (resource === 'photo') { await handlePhoto(pool, req, res, lead); return; }
        if (resource === 'appointment') { await handleAppointment(pool, req, res, lead); return; }
        if (resource === 'appointment-status') { await handleAppointmentStatus(pool, req, res, lead); return; }
        if (resource === 'summary') { await handleSummary(pool, req, res, lead); return; }

        error(res, 400, 'Unknown resource. Use ?resource=call|message|photo|appointment|appointment-status|summary');
    });
}
