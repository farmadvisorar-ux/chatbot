import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const PROBE_ORIGIN = 'https://auditpulse-cors-probe.invalid';

/**
 * Sends a normal GET with an Origin header the target has never allow-listed,
 * and reads back what CORS headers it responds with — exactly what a
 * browser-based cross-origin request does. No credentials are sent and no
 * state-changing request is made; this only observes the server's own
 * response headers.
 */
export const corsCheck: CheckDefinition = {
    id: 'cors-misconfig',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, {
            timeoutMs: ctx.timeoutMs,
            headers: { Origin: PROBE_ORIGIN },
        });

        const allowOrigin = res.headers.get('access-control-allow-origin');
        const allowCredentials = res.headers.get('access-control-allow-credentials');

        if (allowOrigin === '*' && allowCredentials?.toLowerCase() === 'true') {
            findings.push({
                checkId: 'cors-misconfig',
                title: 'CORS allows any origin with credentials',
                severity: 'critical',
                description: 'The server responds with Access-Control-Allow-Origin: * together with Access-Control-Allow-Credentials: true. This combination is invalid per spec in most browsers, but where it takes effect it lets any website read authenticated responses on behalf of a visiting user.',
                evidence: `Access-Control-Allow-Origin: ${allowOrigin}\nAccess-Control-Allow-Credentials: ${allowCredentials}`,
                remediation: 'Never combine a wildcard origin with credentialed CORS. Return a specific, allow-listed origin (echoed only after validating it against a known list) when credentials are involved.',
                references: ['https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny'],
            });
        } else if (allowOrigin === PROBE_ORIGIN) {
            findings.push({
                checkId: 'cors-misconfig',
                title: 'CORS reflects arbitrary Origin headers',
                severity: allowCredentials?.toLowerCase() === 'true' ? 'critical' : 'high',
                description: `The server echoed back an arbitrary, unrecognized Origin (${PROBE_ORIGIN}) in Access-Control-Allow-Origin, rather than validating it against an allowlist. Any website can read cross-origin responses from this endpoint.`,
                evidence: `Access-Control-Allow-Origin: ${allowOrigin}${allowCredentials ? `\nAccess-Control-Allow-Credentials: ${allowCredentials}` : ''}`,
                remediation: 'Validate the Origin header against a fixed allowlist server-side before reflecting it, instead of echoing whatever origin the browser sends.',
                references: ['https://portswigger.net/web-security/cors'],
            });
        }

        return findings;
    },
};
