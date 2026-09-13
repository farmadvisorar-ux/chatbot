import type { Pool } from 'pg';

export type TierSlug = 'free' | 'starter' | 'plus' | 'growth' | 'team' | 'studio' | 'agency';

export interface TierLimits {
    slug: TierSlug;
    name: string;
    /** Hours between automatic re-audits. The cron adds this to now() when a scan finishes. */
    rescanIntervalHours: number;
    /** Page budget for the full-audit crawl (lib/scanner/crawl.ts). */
    crawlPages: number;
    /** Email the owner when a scan turns up a finding the previous scan didn't have. */
    newIssueAlerts: boolean;
    /** Warn at 30/14/7/1 days before the TLS certificate expires. */
    certExpiryAlerts: boolean;
    /** Alert when headers, external scripts or CSP change between scans. */
    changeAlerts: boolean;
    /** Alert when a new subdomain appears in Certificate Transparency logs. */
    subdomainAlerts: boolean;
    /** Show the score trend chart, over this many days of history. */
    trendChartDays: number | null;
    /** Deliver the same alerts to a Slack, Discord or generic webhook. */
    webhookAlerts: boolean;
    /** Mint API keys and call the REST API with them (see api/keys/index.ts). */
    apiAccess: boolean;
    /** Download a scan's findings as CSV or JSON. */
    dataExport: boolean;
}

/**
 * The enforced half of the published pricing ladder — api/tiers/index.ts is
 * what the pricing page shows, this is what the code actually does. The two
 * must be changed together: a tier whose limits aren't represented here is
 * being sold and not delivered.
 *
 * Only free/starter/plus/growth are filled in, because only those four are
 * built.
 * The rest inherit Plus's limits rather than free's, so that if an account is
 * ever set to a higher tier before its features ship it is over-served rather
 * than under-served — the failure mode that doesn't shortchange someone who
 * paid.
 */
const FREE: TierLimits = {
    slug: 'free',
    name: 'Free',
    rescanIntervalHours: 168, // weekly
    crawlPages: 5,
    newIssueAlerts: false,
    certExpiryAlerts: false,
    changeAlerts: false,
    subdomainAlerts: false,
    trendChartDays: null,
    webhookAlerts: false,
    apiAccess: false,
    dataExport: false,
};

const STARTER: TierLimits = {
    ...FREE,
    slug: 'starter',
    name: 'Starter',
    rescanIntervalHours: 24, // daily — 7x faster detection
    crawlPages: 25,
    newIssueAlerts: true,
    certExpiryAlerts: true,
};

const PLUS: TierLimits = {
    ...STARTER,
    slug: 'plus',
    name: 'Plus',
    crawlPages: 100,
    changeAlerts: true,
    subdomainAlerts: true,
    trendChartDays: 90,
};

const GROWTH: TierLimits = {
    ...PLUS,
    slug: 'growth',
    name: 'Growth',
    // Hourly is the fastest the daily-batch design can honestly offer: the
    // cron runs every hour (vercel.json) and picks up whatever is due, so the
    // real floor is "within the hour", not "on the hour".
    rescanIntervalHours: 1,
    webhookAlerts: true,
    apiAccess: true,
    dataExport: true,
};

const TIERS: Record<TierSlug, TierLimits> = {
    free: FREE,
    starter: STARTER,
    plus: PLUS,
    growth: GROWTH,
    // Not built yet. See the note above on why these resolve to Growth.
    team: { ...GROWTH, slug: 'team', name: 'Team' },
    studio: { ...GROWTH, slug: 'studio', name: 'Studio' },
    agency: { ...GROWTH, slug: 'agency', name: 'Agency' },
};

export function limitsFor(slug: string | null | undefined): TierLimits {
    return TIERS[(slug ?? 'free') as TierSlug] ?? FREE;
}

/**
 * Resolves the limits that apply to one account. Any failure to read the tier
 * resolves to free rather than throwing: a database hiccup should degrade a
 * scan's depth, never abort the scan itself.
 */
export async function tierForUser(pool: Pool, userId: string): Promise<TierLimits> {
    try {
        const { rows } = await pool.query('SELECT tier FROM users WHERE id = $1', [userId]);
        return limitsFor(rows[0]?.tier);
    } catch {
        return FREE;
    }
}
