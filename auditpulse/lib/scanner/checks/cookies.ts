import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

/** Parses one or more Set-Cookie header values (Headers.get only returns the first, so getSetCookie is used when available). */
function splitCookies(res: { headers: Headers }): string[] {
    const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === 'function') return anyHeaders.getSetCookie();
    const single = res.headers.get('set-cookie');
    return single ? [single] : [];
}

export const cookiesCheck: CheckDefinition = {
    id: 'cookie-flags',
    tier: 'quick',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, { timeoutMs: ctx.timeoutMs });
        const cookies = splitCookies(res);

        for (const raw of cookies) {
            const name = raw.split('=')[0]?.trim() || 'unknown';
            const lower = raw.toLowerCase();
            const looksSensitive = /session|token|auth|sid|jwt/i.test(name);

            if (!lower.includes('secure')) {
                findings.push({
                    checkId: 'cookie-flags',
                    title: `Cookie "${name}" is missing the Secure flag`,
                    severity: looksSensitive ? 'high' : 'medium',
                    description: 'Without Secure, the browser may send this cookie over an unencrypted HTTP connection, exposing it to network eavesdroppers.',
                    evidence: raw.slice(0, 200),
                    remediation: 'Set the Secure attribute on every cookie (`Set-Cookie: ...; Secure`), especially session/auth cookies.',
                    references: ['https://owasp.org/www-community/controls/SecureCookieAttribute'],
                });
            }
            if (!lower.includes('httponly')) {
                findings.push({
                    checkId: 'cookie-flags',
                    title: `Cookie "${name}" is missing the HttpOnly flag`,
                    severity: looksSensitive ? 'high' : 'low',
                    description: 'Without HttpOnly, this cookie is readable by JavaScript, so any XSS on the page can steal it.',
                    evidence: raw.slice(0, 200),
                    remediation: 'Set the HttpOnly attribute on cookies that JavaScript does not need to read, particularly session/auth cookies.',
                    references: ['https://owasp.org/www-community/HttpOnly'],
                });
            }
            if (!lower.includes('samesite')) {
                findings.push({
                    checkId: 'cookie-flags',
                    title: `Cookie "${name}" is missing the SameSite attribute`,
                    severity: 'low',
                    description: 'Without SameSite, this cookie is sent on cross-site requests by default in older browsers, which increases CSRF exposure.',
                    evidence: raw.slice(0, 200),
                    remediation: 'Set `SameSite=Lax` (or `Strict` for sensitive cookies not needed on cross-site navigations).',
                    references: ['https://owasp.org/www-community/SameSite'],
                });
            }
        }

        return findings;
    },
};
