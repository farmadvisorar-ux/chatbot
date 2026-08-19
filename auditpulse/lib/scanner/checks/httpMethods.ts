import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

export const httpMethodsCheck: CheckDefinition = {
    id: 'http-methods',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, { method: 'OPTIONS', timeoutMs: ctx.timeoutMs });
        const allow = res.headers.get('allow');
        if (!allow) return findings;

        const methods = allow.split(',').map(m => m.trim().toUpperCase());

        if (methods.includes('TRACE')) {
            findings.push({
                checkId: 'http-methods',
                title: 'HTTP TRACE method is enabled',
                severity: 'medium',
                impact: 'Combined with even a minor XSS bug elsewhere, this lets an attacker read cookies and headers that are supposed to be off-limits to page scripts — effectively unlocking a protection browsers try hard to enforce.',
                description: 'The server responds to TRACE requests, which can be combined with cross-site scripting to read HTTP headers (including cookies) that JavaScript normally cannot access (Cross-Site Tracing).',
                evidence: `Allow: ${allow}`,
                remediation: 'Disable the TRACE method at the web server / load balancer level.',
                references: ['https://owasp.org/www-community/attacks/Cross_Site_Tracing'],
            });
        }

        const risky = methods.filter(m => ['PUT', 'DELETE', 'CONNECT'].includes(m));
        if (risky.length) {
            findings.push({
                checkId: 'http-methods',
                title: `Potentially risky HTTP methods enabled: ${risky.join(', ')}`,
                severity: 'low',
                impact: 'If these methods aren\'t properly locked down behind authentication, they can let someone upload, overwrite, or delete files on your server directly — worth confirming they\'re not left open by accident.',
                description: 'These methods are allowed at the server level. If not intentionally required and properly authenticated, they can allow file upload/overwrite or deletion.',
                evidence: `Allow: ${allow}`,
                remediation: 'Restrict the Allow list to only the methods your application actually needs (typically GET, HEAD, POST, OPTIONS), and ensure any state-changing method requires authentication.',
            });
        }

        return findings;
    },
};
