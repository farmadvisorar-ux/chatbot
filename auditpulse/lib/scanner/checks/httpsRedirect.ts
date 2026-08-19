import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

/**
 * Confirms the plain-HTTP origin actually redirects to HTTPS. If port 80
 * isn't listening at all, that's not a finding — refusing plain HTTP
 * entirely is at least as secure as redirecting it.
 */
export const httpsRedirectCheck: CheckDefinition = {
    id: 'https-redirect',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const httpUrl = `http://${ctx.hostname}/`;

        let finalUrl: string;
        try {
            const res = await safeFetch(httpUrl, { timeoutMs: ctx.timeoutMs });
            finalUrl = res.url;
        } catch {
            return findings; // port 80 unreachable/refused — not a vulnerability
        }

        if (!finalUrl.startsWith('https:')) {
            findings.push({
                checkId: 'https-redirect',
                title: 'Plain HTTP is not redirected to HTTPS',
                severity: 'high',
                impact: 'Anyone typing your address without "https://", clicking an old link, or on public wifi can end up viewing (and interacting with) an unencrypted version of your site — visible and alterable by anyone else on that network.',
                description: `Requesting http://${ctx.hostname}/ did not redirect to an HTTPS URL — the response was served over plain HTTP instead.`,
                remediation: 'Configure the web server or load balancer to redirect all HTTP requests to HTTPS with a 301/308 response, and add an HSTS header (see the security-headers finding) so browsers skip HTTP entirely on repeat visits.',
                references: ['https://owasp.org/www-project-transport-layer-protection-cheat-sheet/'],
                affectedUrl: httpUrl,
            });
        }

        return findings;
    },
};
