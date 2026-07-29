import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const REDIRECT_PARAM_NAMES = ['redirect', 'redirect_uri', 'redirect_url', 'url', 'next', 'return', 'returnurl', 'dest', 'destination', 'continue', 'go'];
const LINK_RE = /href\s*=\s*["']([^"'#][^"']*)["']/gi;

/**
 * Heuristic only: looks for links on the homepage whose query string carries
 * a full URL in a commonly-redirected parameter name. It does not follow the
 * link or attempt to trigger a redirect — that would require crafting a
 * payload against a specific endpoint, which is exploitation, not scanning.
 * Flagged links need a manual check.
 */
export const openRedirectCheck: CheckDefinition = {
    id: 'open-redirect-heuristic',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, { timeoutMs: ctx.timeoutMs });
        const body = await res.text();

        const flagged = new Set<string>();
        for (const match of body.matchAll(LINK_RE)) {
            const href = match[1];
            let url: URL;
            try {
                url = new URL(href, ctx.targetUrl);
            } catch {
                continue;
            }
            for (const param of REDIRECT_PARAM_NAMES) {
                const value = url.searchParams.get(param);
                if (value && /^https?:\/\//i.test(value)) {
                    flagged.add(`${param}=${value}`.slice(0, 150));
                }
            }
            if (flagged.size >= 8) break;
        }

        if (flagged.size) {
            findings.push({
                checkId: 'open-redirect-heuristic',
                title: 'Links with redirect-style parameters found (needs manual review)',
                severity: 'low',
                description: 'The homepage links to URLs whose query string carries a full URL in a parameter commonly used for post-action redirects. If the target endpoint redirects to that URL without validating it against an allowlist, it can be abused for phishing (open redirect).',
                evidence: Array.from(flagged).join('\n'),
                remediation: 'Validate any redirect-target parameter against an allowlist of your own domains/paths before issuing a redirect; never redirect to an arbitrary user-supplied URL.',
                references: ['https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/04-Testing_for_Client-side_URL_Redirect'],
                affectedUrl: res.url,
            });
        }

        return findings;
    },
};
