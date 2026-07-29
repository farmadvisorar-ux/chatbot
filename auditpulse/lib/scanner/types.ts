export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
    checkId: string;
    title: string;
    severity: Severity;
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
