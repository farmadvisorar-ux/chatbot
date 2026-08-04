/**
 * Testing-only escape hatch for a separate staging deployment that isn't
 * wired up to Stripe yet. Must never be set on the production project —
 * there is deliberately no way to flip this per-request or per-user, only
 * per-deployment via env var, so it can't leak into prod through any
 * request path.
 */
export function isPaywallBypassed(): boolean {
    return process.env.SKIP_PAYWALL === 'true';
}

/**
 * Operator allowlist for production: specific emails (comma-separated in
 * ADMIN_EMAILS) skip payment entirely, without touching Stripe or Clerk
 * metadata. Unlike SKIP_PAYWALL this is safe to set on the production
 * project — it only exempts the listed addresses, everyone else still pays.
 */
export function isAdminEmail(email: string): boolean {
    const admins = (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return admins.includes(email.trim().toLowerCase());
}
