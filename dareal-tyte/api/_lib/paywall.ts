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
