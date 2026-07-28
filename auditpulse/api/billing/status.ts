import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { isActiveSubscription } from '../_lib/stripe.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;

    const { rows } = await getPool().query(
        'SELECT subscription_status, subscription_current_period_end FROM users WHERE id = $1',
        [user.userId],
    );
    const status = rows[0]?.subscription_status ?? null;
    json(res, 200, {
        subscriptionStatus: status,
        active: isActiveSubscription(status),
        currentPeriodEnd: rows[0]?.subscription_current_period_end ?? null,
    });
}
