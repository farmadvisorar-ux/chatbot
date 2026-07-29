import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const SENSITIVE_HINT = /(admin|internal|staging|backup|private|secret|debug|config|test)/i;

export const robotsSitemapCheck: CheckDefinition = {
    id: 'robots-disclosure',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const base = ctx.targetUrl.replace(/\/$/, '');
        const res = await safeFetch(`${base}/robots.txt`, { timeoutMs: ctx.timeoutMs });
        if (res.status !== 200) return findings;

        const body = await res.text();
        const disallowed = Array.from(body.matchAll(/^Disallow:\s*(\S+)/gim)).map(m => m[1]);
        const interesting = disallowed.filter(p => SENSITIVE_HINT.test(p));

        if (interesting.length) {
            findings.push({
                checkId: 'robots-disclosure',
                title: 'robots.txt hints at sensitive paths',
                severity: 'low',
                description: 'robots.txt only asks well-behaved crawlers not to index these paths — it does not restrict access. Listing them here can point an attacker directly at areas worth targeting.',
                evidence: interesting.slice(0, 15).join('\n'),
                remediation: 'Do not rely on robots.txt to hide sensitive paths; enforce authentication/authorization on them server-side. Remove paths from robots.txt that reveal internal structure unnecessarily.',
                references: ['https://owasp.org/www-community/vulnerabilities/Information_exposure_through_robots.txt'],
                affectedUrl: `${base}/robots.txt`,
            });
        }

        return findings;
    },
};
