import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const RESOURCE_ATTR = /(?:src|href)\s*=\s*["']http:\/\/([^"'>]+)["']/gi;

export const mixedContentCheck: CheckDefinition = {
    id: 'mixed-content',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        if (!ctx.targetUrl.startsWith('https:')) return [];
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, { timeoutMs: ctx.timeoutMs });
        const body = await res.text();

        const found = new Set<string>();
        for (const match of body.matchAll(RESOURCE_ATTR)) {
            found.add(match[0]);
            if (found.size >= 10) break;
        }

        if (found.size > 0) {
            findings.push({
                checkId: 'mixed-content',
                title: 'Mixed content: HTTPS page loads resources over HTTP',
                severity: 'medium',
                description: `Found ${found.size} resource reference(s) loaded over plain HTTP on an HTTPS page. Browsers may block or warn on these, and they are interceptable/modifiable by a network attacker.`,
                evidence: Array.from(found).slice(0, 5).join('\n'),
                remediation: 'Change all asset references (scripts, stylesheets, images, iframes) to HTTPS or protocol-relative URLs.',
                references: ['https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content'],
                affectedUrl: res.url,
            });
        }

        return findings;
    },
};
