import type { VercelRequest, VercelResponse } from '@vercel/node';
import type pg from 'pg';
import { Webhook } from 'svix';
import { getPool } from '../_lib/db.js';
import { error, json, requireMethod } from '../_lib/http.js';
import { sendWelcomeEmail } from '../_lib/email.js';

export const config = { api: { bodyParser: false } };

type ClerkUserEvent = {
    type: string;
    data: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email_addresses: Array<{ id: string; email_address: string }>;
        primary_email_address_id: string | null;
    };
};

/**
 * Removes a deleted Clerk user's personal data. Marketplace listings and
 * orders reference users by id, so a plain DELETE fails for anyone with
 * trading history — those rows are financial records worth keeping. In that
 * case the row is kept for referential integrity but its identifying fields
 * are scrubbed. Users with no history are deleted outright.
 */
async function removeUser(pool: pg.Pool, userId: string): Promise<void> {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    } catch (err) {
        if ((err as { code?: string }).code !== '23503') throw err;
        await pool.query(
            `UPDATE users SET email = 'deleted-' || id || '@removed.invalid', name = NULL WHERE id = $1`,
            [userId],
        );
    }
}

function readRawBody(req: VercelRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['POST'])) return;

    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        error(res, 501, 'Webhook is not configured');
        return;
    }

    const payload = await readRawBody(req);
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (typeof svixId !== 'string' || typeof svixTimestamp !== 'string' || typeof svixSignature !== 'string') {
        error(res, 400, 'Missing Svix headers');
        return;
    }

    let event: ClerkUserEvent;
    try {
        const webhook = new Webhook(secret);
        event = webhook.verify(payload, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
        }) as ClerkUserEvent;
    } catch {
        error(res, 400, 'Invalid webhook signature');
        return;
    }

    if (event.type === 'user.created' || event.type === 'user.updated') {
        const { data } = event;
        const primaryEmail = data.email_addresses.find(addr => addr.id === data.primary_email_address_id)
            ?? data.email_addresses[0];
        if (primaryEmail) {
            const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;
            const pool = getPool();
            const upserted = await pool.query(
                `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
                 RETURNING (xmax = 0) AS inserted`,
                [data.id, primaryEmail.email_address, name],
            );
            if (event.type === 'user.created' && upserted.rows[0]?.inserted) {
                await sendWelcomeEmail(primaryEmail.email_address, name);
            }
        }
    } else if (event.type === 'user.deleted') {
        await removeUser(getPool(), event.data.id);
    }

    json(res, 200, { received: true });
}
