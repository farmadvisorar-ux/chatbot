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
}

/**
 * The enforced half of the published pricing ladder — api/tiers/index.ts is
 * what the pricing page shows, this is what the code actually does. The two
 * must be changed together: a tier whose limits aren't represented here is
 * being sold and not delivered.
 *
 * Only free/starter/plus are filled in, because only those three are built.
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

const TIERS: Record<TierSlug, TierLimits> = {
    free: FREE,
    starter: STARTER,
    plus: PLUS,
    // Not built yet. See the note above on why these resolve to Plus.
    growth: { ...PLUS, slug: 'growth', name: 'Growth' },
    team: { ...PLUS, slug: 'team', name: 'Team' },
    studio: { ...PLUS, slug: 'studio', name: 'Studio' },
    agency: { ...PLUS, slug: 'agency', name: 'Agency' },
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
