import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from './_lib/http.js';

/**
 * Every environment variable this deployment expects, and what stops working
 * without it. Grouped by capability rather than listed flat, because the
 * question an operator actually has is "why is checkout dead", not "is
 * STRIPE_SECRET_KEY set".
 */
const EXPECTED: { capability: string; vars: string[]; without: string }[] = [
    { capability: 'database', vars: ['DATABASE_URL'], without: 'Nothing that touches an account works.' },
    { capability: 'auth', vars: ['CLERK_SECRET_KEY'], without: 'Every authenticated request returns 501.' },
    { capability: 'authWebhook', vars: ['CLERK_WEBHOOK_SECRET'], without: 'Users are mirrored on first request instead of at sign-up.' },
    { capability: 'email', vars: ['RESEND_API_KEY'], without: 'No reports, alerts or welcome emails are sent.' },
    { capability: 'billing', vars: ['STRIPE_SECRET_KEY'], without: 'Paid tiers show "Coming soon" and checkout returns 501.' },
    { capability: 'billingWebhook', vars: ['STRIPE_WEBHOOK_SECRET'], without: 'Payments would succeed but no tier is ever granted.' },
    { capability: 'encryption', vars: ['TOKEN_ENCRYPTION_KEY'], without: 'GitHub repos and signed webhooks cannot be connected.' },
    { capability: 'cron', vars: ['CRON_SECRET'], without: 'The re-audit cron is callable by anyone.' },
    { capability: 'siteUrl', vars: ['PUBLIC_SITE_URL'], without: 'Emailed links and the trust badge fall back to a default origin.' },
];

/**
 * GET /api/health              -> liveness
 * GET /api/health?check=config -> which capabilities are configured
 *
 * The config view reports presence only — never a value, never a prefix of
 * one. It discloses nothing that is not already observable: every
 * unconfigured capability answers 501 with the same information when called
 * directly. What it adds is seeing all of them at once, which is the
 * difference between "checkout is broken" and "STRIPE_SECRET_KEY never
 * reached the Production environment".
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;

    if (req.query.check !== 'config') {
        json(res, 200, { message: 'Success' });
        return;
    }

    const capabilities: Record<string, { configured: boolean; missing: string[]; impact?: string }> = {};
    for (const entry of EXPECTED) {
        const missing = entry.vars.filter(name => !process.env[name]);
        capabilities[entry.capability] = missing.length
            ? { configured: false, missing, impact: entry.without }
            : { configured: true, missing: [] };
    }

    json(res, 200, {
        // Which Vercel environment answered. A variable saved to Preview only
        // is the most common reason a redeploy appears to change nothing in
        // production, and this is what makes that visible.
        environment: process.env.VERCEL_ENV ?? 'unknown',
        capabilities,
    });
}
