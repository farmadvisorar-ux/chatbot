import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { getPool } from '../_lib/db.js';
import { hasActiveAccess, hasFixAccess } from '../_lib/stripe.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    const user = await requireAuth(req, res);
    if (!user) return;

    const { rows } = await getPool().query(
        'SELECT subscription_status, subscription_current_period_end, plan, plan_expires_at FROM users WHERE id = $1',
        [user.userId],
    );
    const row = rows[0] ?? {};
    json(res, 200, {
        subscriptionStatus: row.subscription_status ?? null,
        active: hasActiveAccess(row),
        plan: row.plan ?? null,
        fixAccess: hasFixAccess(row),
        currentPeriodEnd: row.subscription_current_period_end ?? null,
        planExpiresAt: row.plan_expires_at ?? null,
    });
}
