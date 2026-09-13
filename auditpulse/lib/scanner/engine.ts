import type { CheckDefinition, Finding, ScanContext, SiteFingerprint } from './types.js';
import { headersCheck } from './checks/headers.js';
import { tlsCheck } from './checks/tls.js';
import { cookiesCheck } from './checks/cookies.js';
import { serverFingerprintCheck } from './checks/serverFingerprint.js';
import { exposedPathsCheck } from './checks/exposedPaths.js';
import { corsCheck } from './checks/cors.js';
import { mixedContentCheck } from './checks/mixedContent.js';
import { dnsEmailSecurityCheck } from './checks/dnsEmailSecurity.js';
import { outdatedJsLibrariesCheck } from './checks/outdatedJsLibraries.js';
import { httpMethodsCheck } from './checks/httpMethods.js';
import { subdomainEnumCheck } from './checks/subdomainEnum.js';
import { robotsSitemapCheck } from './checks/robotsSitemap.js';
import { openRedirectCheck } from './checks/openRedirect.js';
import { exposedSecretsCheck } from './checks/exposedSecrets.js';
import { directoryListingCheck } from './checks/directoryListing.js';
import { httpsRedirectCheck } from './checks/httpsRedirect.js';
import { subresourceIntegrityCheck } from './checks/subresourceIntegrity.js';
import { graphqlIntrospectionCheck } from './checks/graphqlIntrospection.js';
import { computeScore, scoreToGrade, summarizeBySeverity } from './grade.js';
import { assertPublicHost, DisallowedTargetError } from './net.js';
import { discoverPages, fetchHomepageHtml } from './crawl.js';

const QUICK_CHECKS: CheckDefinition[] = [headersCheck, tlsCheck, cookiesCheck, serverFingerprintCheck];
const FULL_CHECKS: CheckDefinition[] = [
    ...QUICK_CHECKS,
    exposedPathsCheck,
    corsCheck,
    mixedContentCheck,
    dnsEmailSecurityCheck,
    outdatedJsLibrariesCheck,
    httpMethodsCheck,
    subdomainEnumCheck,
    robotsSitemapCheck,
    openRedirectCheck,
    exposedSecretsCheck,
    directoryListingCheck,
    httpsRedirectCheck,
    subresourceIntegrityCheck,
    graphqlIntrospectionCheck,
];

const MAX_CRAWL_PAGES = 5;

/** Headers worth diffing between scans; the rest (dates, request ids, cache state) change constantly and would be pure noise. */
const FINGERPRINT_HEADERS = [
    'content-security-policy',
    'strict-transport-security',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'cross-origin-opener-policy',
    'access-control-allow-origin',
];

const SCRIPT_SRC_RE = /<script\s[^>]*src\s*=\s*["']([^"']+)["']/gi;

export interface ScanRunResult {
    findings: Finding[];
    score: number;
    grade: string;
    summary: Record<string, number>;
    checkErrors: { checkId: string; error: string }[];
    pagesScanned: number;
    fingerprint: SiteFingerprint;
}

export interface ScanOptions {
    /** Crawl budget for full scans. Defaults to the free tier's 5 pages. */
    maxPages?: number;
}

/** External script hosts referenced by the homepage. Same-origin scripts are excluded: the interesting change is a *third party* appearing. */
function externalScriptHosts(html: string, baseUrl: string): string[] {
    const base = new URL(baseUrl);
    const hosts = new Set<string>();
    for (const match of html.matchAll(SCRIPT_SRC_RE)) {
        try {
            const url = new URL(match[1], baseUrl);
            if (url.hostname && url.hostname !== base.hostname) hosts.add(url.hostname.toLowerCase());
        } catch {
            // A src we can't parse isn't a host we can meaningfully diff.
        }
    }
    return Array.from(hosts).sort();
}

export function normalizeTargetUrl(input: string): { targetUrl: string; hostname: string } {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Only http:// and https:// URLs are supported.');
    }
    return { targetUrl: `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`, hostname: parsed.hostname };
}

/**
 * Runs every check for the given tier against one target and aggregates the
 * results. Each check gets its own timeout budget and failures are isolated
 * (Promise.allSettled) so one slow/broken check never takes the whole scan
 * down. Re-validates the target isn't a private/internal address up front,
 * on top of the same guard inside every network call each check makes.
 *
 * Full scans additionally crawl a few same-origin pages linked from the
 * homepage (lib/scanner/crawl.ts) — checks that benefit from seeing more of
 * the site than just the homepage (mixed content, exposed secrets in JS
 * bundles, missing subresource integrity) read from ctx.additionalPages.
 */
export async function runScan(rawUrl: string, kind: 'quick' | 'full', options: ScanOptions = {}): Promise<ScanRunResult> {
    const { targetUrl, hostname } = normalizeTargetUrl(rawUrl);
    await assertPublicHost(hostname);

    const checks = kind === 'quick' ? QUICK_CHECKS : FULL_CHECKS;
    const timeoutMs = 7000;
    const maxPages = Math.max(1, options.maxPages ?? MAX_CRAWL_PAGES);

    let additionalPages: string[] = [targetUrl];
    const fingerprint: SiteFingerprint = { headers: {}, scriptHosts: [], subdomains: [] };
    if (kind === 'full') {
        const { html, headers } = await fetchHomepageHtml(targetUrl, timeoutMs);
        additionalPages = html ? await discoverPages(targetUrl, html, maxPages) : [targetUrl];
        for (const name of FINGERPRINT_HEADERS) {
            if (headers[name] !== undefined) fingerprint.headers[name] = headers[name];
        }
        fingerprint.scriptHosts = externalScriptHosts(html, targetUrl);
    }

    const ctx: ScanContext = {
        targetUrl,
        hostname,
        kind,
        timeoutMs,
        additionalPages,
        observe: observation => {
            if (observation.subdomains) fingerprint.subdomains = [...observation.subdomains].sort();
            if (observation.certExpiresAt) fingerprint.certExpiresAt = observation.certExpiresAt;
        },
    };

    const results = await Promise.allSettled(checks.map(check => check.run(ctx)));

    const findings: Finding[] = [];
    const checkErrors: { checkId: string; error: string }[] = [];
    results.forEach((result, i) => {
        const checkId = checks[i].id;
        if (result.status === 'fulfilled') {
            findings.push(...result.value);
        } else {
            const message = result.reason instanceof DisallowedTargetError
                ? result.reason.message
                : result.reason instanceof Error ? result.reason.message : 'Check failed to complete';
            checkErrors.push({ checkId, error: message });
        }
    });

    const score = computeScore(findings);
    return {
        findings,
        score,
        grade: scoreToGrade(score),
        summary: summarizeBySeverity(findings),
        checkErrors,
        pagesScanned: additionalPages.length,
        fingerprint,
    };
}
