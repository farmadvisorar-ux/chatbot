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
    /**
     * Optional sink for facts a check already established that are worth
     * carrying between scans, but which aren't findings in themselves — the
     * full subdomain list, where the finding only quotes the first 15, or the
     * certificate's expiry date, which produces no finding at all until it is
     * under two weeks away. Optional so a check can stay unaware of it, and so
     * callers that don't need change detection pay nothing.
     */
    observe?: (observation: ScanObservations) => void;
}

/** Partial observations reported by checks during a scan; merged into the fingerprint. */
export interface ScanObservations {
    /** Every subdomain seen in Certificate Transparency logs. */
    subdomains?: string[];
    /** The installed certificate's notAfter date, as reported by the TLS handshake. */
    certExpiresAt?: string;
}

/**
 * What a site looked like on one scan: enough to notice a meaningful change
 * on the next one without re-requesting anything. Assembled from responses
 * the scan already makes (lib/scanner/engine.ts).
 */
export interface SiteFingerprint {
    /** Security-relevant response headers from the homepage, lowercased. */
    headers: Record<string, string>;
    /** Distinct hosts serving external <script src>, sorted. */
    scriptHosts: string[];
    /** Every subdomain seen in Certificate Transparency logs, sorted. */
    subdomains: string[];
    /** The installed certificate's notAfter date, when the TLS handshake reported one. */
    certExpiresAt?: string;
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
