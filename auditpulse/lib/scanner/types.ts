export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
    checkId: string;
    title: string;
    severity: Severity;
    /** Plain-English, non-technical: what could actually go wrong because of this — written for the site owner, not a developer. */
    impact: string;
    description: string;
    evidence?: string;
    remediation: string;
    references?: string[];
    affectedUrl?: string;
}

export interface ScanContext {
    /** Normalized target, e.g. https://example.com */
    targetUrl: string;
    hostname: string;
    kind: 'quick' | 'full';
    /** Per-request timeout budget for this check. */
    timeoutMs: number;
    /**
     * Same-origin pages discovered by crawling the homepage's internal links
     * (lib/scanner/crawl.ts), always including targetUrl itself. Only
     * populated for 'full' scans — checks that benefit from seeing more of
     * the site than just the homepage (mixed content, exposed secrets in JS
     * bundles, missing subresource integrity) read from this instead of
     * only fetching targetUrl.
     */
    additionalPages: string[];
}

export interface CheckOutcome {
    checkId: string;
    findings: Finding[];
    /** Set when the check itself failed to run (network error, timeout, etc). Not a finding. */
    error?: string;
}

export interface CheckDefinition {
    id: string;
    /** 'quick' checks are safe to run unauthenticated against any public URL (a single passive GET/HEAD). */
    tier: 'quick' | 'full';
    run(ctx: ScanContext): Promise<Finding[]>;
}
