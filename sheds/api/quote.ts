import type { VercelRequest, VercelResponse } from '@vercel/node';
import pg from 'pg';

/**
 * Receives a callback request from any of the forms on the site.
 *
 * The forms are ordinary HTML forms with a real `action`, and this replies
 * with a redirect rather than JSON, so a lead is captured whether or not any
 * JavaScript ran. For a business whose customers are homeowners on old phones
 * on rural connections, a lead form that depends on a script executing is a
 * lead form that silently loses money.
 *
 * A lead is never rejected for being malformed. Someone who mistypes their
 * email still wants a call back and still left a phone number; bouncing them
 * to an error page loses a customer to protect a database column. Validation
 * here decides what gets flagged for the dealer's attention, not who gets to
 * make contact.
 */

const MAX = { name: 120, phone: 40, email: 254, zip: 12, note: 1000, buildingId: 100 };

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
    const connectionString = process.env.DATABASE_URL
        ?? process.env.POSTGRES_URL
        ?? process.env.POSTGRES_PRISMA_URL;
    if (!connectionString) return null;
    if (!pool) {
        pool = new pg.Pool({
            connectionString,
            ssl: /@(localhost|127\.0\.0\.1)/.test(connectionString) ? false : { rejectUnauthorized: false },
            max: 3,
            connectionTimeoutMillis: 8000,
        });
    }
    return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shed_leads (
    id           bigserial PRIMARY KEY,
    created_at   timestamptz NOT NULL DEFAULT now(),
    name         text NOT NULL,
    phone        text NOT NULL,
    email        text NOT NULL,
    zip          text NOT NULL,
    note         text NOT NULL DEFAULT '',
    building_id  text NOT NULL DEFAULT '',
    source_page  text NOT NULL DEFAULT '',
    suspect      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS shed_leads_created_idx ON shed_leads (created_at DESC);
`;

/**
 * Control characters become spaces before anything else happens. They arrive
 * from a careless copy-paste far more often than from anyone malicious, and a
 * newline inside a name is enough to make a lead list unreadable in a
 * terminal or misaligned in a spreadsheet.
 */
function clean(value: unknown, max: number): string {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, max);
}

/**
 * Whether the lead looks like it needs a second glance before someone spends
 * a call on it — not whether it is allowed through. Everything is stored
 * either way; this only sets a flag the dealer can sort on.
 */
export function looksSuspect(fields: { name: string; phone: string; email: string }): boolean {
    const digits = fields.phone.replace(/\D/g, '');
    if (digits.length < 7) return true;
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(fields.email)) return true;
    if (fields.name.length < 2) return true;
    // A URL in the name field is a bot filling every input it finds.
    if (/https?:\/\//i.test(fields.name)) return true;
    return false;
}

/** Vercel parses JSON and form bodies; a raw string can still arrive. */
function readBody(req: VercelRequest): Record<string, unknown> {
    const b = req.body;
    if (!b) return {};
    if (typeof b === 'string') {
        try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(b)); }
    }
    return b as Record<string, unknown>;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Method not allowed. Use POST.' });
        return;
    }

    const body = readBody(req);
    const lead = {
        name: clean(body.name, MAX.name),
        phone: clean(body.phone, MAX.phone),
        email: clean(body.email, MAX.email),
        zip: clean(body.zip, MAX.zip),
        note: clean(body.note, MAX.note),
        buildingId: clean(body.buildingId, MAX.buildingId),
        sourcePage: clean(req.headers.referer, 300),
    };

    // Nothing at all was filled in — a bare bot POST, not a person.
    if (!lead.name && !lead.phone && !lead.email) {
        res.status(400).json({ error: 'Tell us how to reach you.' });
        return;
    }

    const suspect = looksSuspect(lead);

    try {
        const db = getPool();
        if (db) {
            await db.query(SCHEMA);
            await db.query(
                `INSERT INTO shed_leads (name, phone, email, zip, note, building_id, source_page, suspect)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [lead.name, lead.phone, lead.email, lead.zip, lead.note, lead.buildingId, lead.sourcePage, suspect],
            );
        } else {
            // No database yet. The lead still has to survive, so it goes to the
            // function log where it can be read and called back — losing a
            // customer because a setup step was skipped is not acceptable.
            console.warn('[quote] no DATABASE_URL — lead captured in logs only', JSON.stringify(lead));
        }
    } catch (err) {
        // Storage failed, and the person is still waiting on a page. They get
        // the thank-you and the dealer gets the lead out of the log; failing
        // visibly here would lose the enquiry entirely.
        console.error('[quote] could not store lead', err, JSON.stringify(lead));
    }

    // 303 so the browser re-requests with GET: a refresh on the thank-you page
    // must not resubmit the form.
    res.setHeader('Location', '/thanks.html');
    res.status(303).end();
}
