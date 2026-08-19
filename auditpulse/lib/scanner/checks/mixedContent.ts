import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const RESOURCE_ATTR = /(?:src|href)\s*=\s*["']http:\/\/([^"'>]+)["']/gi;

export const mixedContentCheck: CheckDefinition = {
    id: 'mixed-content',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        if (!ctx.targetUrl.startsWith('https:')) return [];
        const findings: Finding[] = [];

        for (const pageUrl of ctx.additionalPages) {
            if (!pageUrl.startsWith('https:')) continue;
            const res = await safeFetch(pageUrl, { timeoutMs: ctx.timeoutMs }).catch(() => null);
            if (!res) continue;
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
                    impact: 'Anyone on the same network as your visitor — a coffee shop wifi, a compromised router — can intercept or swap out these unencrypted resources, and modern browsers will flag or block your page as "not secure" because of it.',
                    description: `Found ${found.size} resource reference(s) loaded over plain HTTP on an HTTPS page. Browsers may block or warn on these, and they are interceptable/modifiable by a network attacker.`,
                    evidence: Array.from(found).slice(0, 5).join('\n'),
                    remediation: 'Change all asset references (scripts, stylesheets, images, iframes) to HTTPS or protocol-relative URLs.',
                    references: ['https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content'],
                    affectedUrl: res.url,
                });
            }
        }

        return findings;
    },
};
