import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

/**
 * Security response headers, checked the same way securityheaders.com /
 * Mozilla Observatory do: one GET request, read what any browser already
 * receives. Purely passive — safe to run without ownership verification.
 */
export const headersCheck: CheckDefinition = {
    id: 'security-headers',
    tier: 'quick',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, { timeoutMs: ctx.timeoutMs });
        const h = res.headers;

        if (!h.get('strict-transport-security')) {
            findings.push({
                checkId: 'security-headers',
                title: 'Missing HTTP Strict-Transport-Security (HSTS) header',
                severity: 'high',
                impact: 'Someone on public wifi could quietly downgrade a visitor to an unencrypted connection and read or alter everything they send — logins, form data, payment details — without either side noticing.',
                description: 'The site does not instruct browsers to always use HTTPS, leaving visitors on an HTTP link vulnerable to SSL-stripping and downgrade attacks.',
                remediation: 'Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` to every HTTPS response, and consider submitting the domain to the HSTS preload list.',
                references: ['https://owasp.org/www-project-secure-headers/#http-strict-transport-security', 'https://hstspreload.org/'],
                affectedUrl: res.url,
            });
        } else {
            const maxAgeMatch = h.get('strict-transport-security')!.match(/max-age=(\d+)/i);
            const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
            if (maxAge < 15552000) {
                findings.push({
                    checkId: 'security-headers',
                    title: 'HSTS max-age is too short',
                    severity: 'low',
                    impact: 'Visitors who haven\'t been to your site in a while fall back to the same downgrade risk HSTS is meant to prevent, sooner than it should let them.',
                    description: `Strict-Transport-Security max-age is ${maxAge} seconds (recommended: at least 15552000 / 180 days).`,
                    remediation: 'Increase max-age to at least 15552000 (6 months), ideally 31536000 (1 year) with includeSubDomains.',
                    references: ['https://owasp.org/www-project-secure-headers/#http-strict-transport-security'],
                    affectedUrl: res.url,
                });
            }
        }

        const csp = h.get('content-security-policy');
        if (!csp) {
            findings.push({
                checkId: 'security-headers',
                title: 'Missing Content-Security-Policy (CSP) header',
                severity: 'high',
                impact: 'If an attacker ever manages to inject a script into your page (a comment field, a compromised third-party widget, a vulnerable plugin), there is nothing stopping it from running and stealing visitor data — CSP is the browser-level safety net for exactly that scenario.',
                description: 'Without a CSP, the browser has no defense-in-depth against cross-site scripting (XSS): any injected <script> tag runs unrestricted.',
                remediation: "Add a Content-Security-Policy header, starting narrow (e.g. `default-src 'self'`) and loosening only for origins you actually load from. Use Report-Only mode first to find breakage without blocking anything.",
                references: ['https://owasp.org/www-community/controls/Content_Security_Policy', 'https://csp.withgoogle.com/docs/strict-csp.html'],
                affectedUrl: res.url,
            });
        } else if (/(^|;)\s*default-src[^;]*\*/i.test(csp) || /script-src[^;]*'unsafe-inline'/i.test(csp)) {
            findings.push({
                checkId: 'security-headers',
                title: 'Content-Security-Policy is too permissive',
                severity: 'medium',
                impact: 'You have the safety net in place, but the holes in it are big enough that an injected script would likely still run — you get the maintenance cost of a CSP without most of the protection.',
                description: "The CSP allows wildcard sources or `'unsafe-inline'` scripts, which defeats most of its XSS protection.",
                evidence: csp.slice(0, 300),
                remediation: "Remove `'unsafe-inline'` from script-src (use nonces or hashes instead) and replace wildcard sources with an explicit allowlist.",
                references: ['https://csp.withgoogle.com/docs/strict-csp.html'],
                affectedUrl: res.url,
            });
        }

        if (!h.get('x-content-type-options')) {
            findings.push({
                checkId: 'security-headers',
                title: 'Missing X-Content-Type-Options header',
                severity: 'low',
                impact: 'In some older browsers, a file that isn\'t supposed to be executable (like an uploaded image) could be reinterpreted and run as script — a minor but real crack in the site\'s defenses.',
                description: 'Without `nosniff`, older browsers may MIME-sniff responses and execute content that was not intended to run as script.',
                remediation: 'Add `X-Content-Type-Options: nosniff` to all responses.',
                references: ['https://owasp.org/www-project-secure-headers/#x-content-type-options'],
                affectedUrl: res.url,
            });
        }

        const xfo = h.get('x-frame-options');
        const frameAncestors = csp && /frame-ancestors/i.test(csp);
        if (!xfo && !frameAncestors) {
            findings.push({
                checkId: 'security-headers',
                title: 'Missing clickjacking protection (X-Frame-Options / frame-ancestors)',
                severity: 'medium',
                impact: 'A malicious site can invisibly overlay your page inside their own, so a visitor thinks they\'re clicking a harmless button but is actually clicking something on your site — approving a payment, changing a setting, whatever the attacker positions underneath.',
                description: 'The page can be embedded in an <iframe> on any external site, enabling clickjacking attacks that trick users into clicking hidden UI.',
                remediation: "Add `X-Frame-Options: DENY` (or `SAMEORIGIN`) and/or a CSP `frame-ancestors 'none'` directive.",
                references: ['https://owasp.org/www-community/attacks/Clickjacking'],
                affectedUrl: res.url,
            });
        }

        if (!h.get('referrer-policy')) {
            findings.push({
                checkId: 'security-headers',
                title: 'Missing Referrer-Policy header',
                severity: 'info',
                impact: 'If any of your page URLs contain something sensitive in the address itself (a password reset token, a private search term), that full address can leak to whatever third-party site or ad your visitor clicks through to next.',
                description: 'Without an explicit policy, full URLs (which may contain tokens or identifiers in the query string) can leak to third parties via the Referer header.',
                remediation: "Add `Referrer-Policy: strict-origin-when-cross-origin` (or stricter, e.g. `no-referrer`).",
                references: ['https://owasp.org/www-project-secure-headers/#referrer-policy'],
                affectedUrl: res.url,
            });
        }

        if (!h.get('permissions-policy')) {
            findings.push({
                checkId: 'security-headers',
                title: 'Missing Permissions-Policy header',
                severity: 'info',
                impact: 'A compromised or careless third-party script embedded on your page (an ad, a widget) could ask the visitor\'s browser for their camera, microphone, or location with nothing stopping it at the browser level.',
                description: 'No policy restricts which browser features (camera, microphone, geolocation, etc.) the page — or an embedded third-party script — may request.',
                remediation: "Add a `Permissions-Policy` header disabling features you don't use, e.g. `camera=(), microphone=(), geolocation=()`.",
                references: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy'],
                affectedUrl: res.url,
            });
        }

        if (!h.get('cross-origin-opener-policy')) {
            findings.push({
                checkId: 'security-headers',
                title: 'Missing Cross-Origin-Opener-Policy header',
                severity: 'info',
                impact: 'A page you link out to can keep a hidden handle back into the tab it was opened from, which contributes to a class of "tabnabbing" tricks (silently swapping content in the tab a visitor left open) and other cross-window attacks.',
                description: 'Without COOP, other origins can retain a `window.opener` reference to this page and interact with it (a component of Spectre-class and tabnabbing attacks).',
                remediation: 'Add `Cross-Origin-Opener-Policy: same-origin`.',
                references: ['https://owasp.org/www-project-secure-headers/#cross-origin-opener-policy'],
                affectedUrl: res.url,
            });
        }

        return findings;
    },
};
