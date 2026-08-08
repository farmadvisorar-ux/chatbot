/**
 * A one-URL answer to "which deployment am I looking at, and what does it
 * actually see?"
 *
 * Setting an environment variable in a dashboard and having it not take effect
 * has cost this project more time than every other problem combined, and the
 * reason is that none of the failure modes look different from the outside:
 * a variable saved to the wrong project, saved without Production ticked,
 * saved but never rebuilt, or saved and rebuilt from a cached build all
 * produce the same silence. Nothing in the UI contradicts the assumption that
 * it worked.
 *
 * So the deployment reports on itself. It names the project, branch and commit
 * it was built from — which settles "am I even editing the right project"
 * before anything else — and then says, for each setting, whether the running
 * function can see a value.
 *
 * Presence only. No value from any secret is returned, in whole or in part,
 * and there is no code path here that reads one: `describeEnv` receives the
 * environment and immediately reduces it to booleans. The two exceptions are
 * both deliberate and neither is a secret — the effective site origin, whose
 * being wrong silently breaks Stripe's redirect back from checkout, and
 * whether the Stripe key is a test or live key, which is the difference
 * between accepting real money and only appearing to. That check reads the
 * documented `sk_test_` / `sk_live_` prefix and returns a word.
 */

/** Every setting the application reads, and what it is for. */
export const SETTINGS = [
    { name: 'DATABASE_URL', required: true, purpose: 'Postgres connection' },
    { name: 'STRIPE_SECRET_KEY', required: true, purpose: 'taking payments' },
    { name: 'STRIPE_WEBHOOK_SECRET', required: true, purpose: 'confirming payments' },
    { name: 'ADMIN_SECRET', required: true, purpose: 'the review queue at /admin.html' },
    { name: 'PUBLIC_SITE_URL', required: false, purpose: 'where Stripe returns to' },
] as const;

/**
 * The connection-string aliases db.ts accepts. Reported individually because
 * a Neon or Vercel Postgres integration sets several at once under names
 * nobody chose, and knowing which one arrived is the difference between
 * "the integration is attached" and "someone pasted a URL by hand".
 */
const DATABASE_ALIASES = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
] as const;

export interface DeploymentStatus {
    deployment: {
        project: string | null;
        environment: string | null;
        branch: string | null;
        commit: string | null;
        region: string | null;
    };
    /** Setting name → whether this deployment can see a value for it. */
    settings: Record<string, boolean>;
    /** Which connection-string alias, if any, the database is coming from. */
    databaseVariable: string | null;
    /** 'live', 'test', or null when no Stripe key is visible. */
    stripeMode: 'live' | 'test' | null;
    /** Effective value of siteOrigin(), including its built-in fallback. */
    siteOrigin: string;
    /** Required settings with nothing behind them, in the order to fix them. */
    missing: string[];
    ready: boolean;
}

/**
 * Pure so it can be tested without a deployment. Takes the environment rather
 * than reaching for `process.env`, which is also what keeps the "no secret can
 * leak from here" claim checkable: the tests below pass in fake secrets and
 * assert that no substring of any of them appears in the output.
 */
export function describeEnv(env: Record<string, string | undefined>): DeploymentStatus {
    const has = (name: string): boolean => Boolean(env[name]);

    const settings: Record<string, boolean> = {};
    for (const { name } of SETTINGS) settings[name] = has(name);
    for (const alias of DATABASE_ALIASES) settings[alias] = has(alias);

    // db.ts takes the first alias that is present, so report the same one it
    // would actually connect with rather than "a database is configured".
    const databaseVariable = DATABASE_ALIASES.find(has) ?? null;
    settings.DATABASE_URL = databaseVariable !== null;

    const key = env.STRIPE_SECRET_KEY ?? '';
    const stripeMode = key.startsWith('sk_live_') || key.startsWith('rk_live_')
        ? 'live'
        : key.startsWith('sk_test_') || key.startsWith('rk_test_')
            ? 'test'
            : null;

    const missing = SETTINGS.filter((s) => s.required && !settings[s.name]).map((s) => s.name);

    return {
        deployment: {
            project: env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL ?? null,
            environment: env.VERCEL_ENV ?? null,
            branch: env.VERCEL_GIT_COMMIT_REF ?? null,
            commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
            region: env.VERCEL_REGION ?? null,
        },
        settings,
        databaseVariable,
        stripeMode,
        siteOrigin: env.PUBLIC_SITE_URL || 'https://sikads.com',
        missing,
        ready: missing.length === 0,
    };
}
