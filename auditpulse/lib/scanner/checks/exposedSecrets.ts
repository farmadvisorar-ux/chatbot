import type { CheckDefinition, Finding, Severity } from '../types.js';
import { safeFetch } from '../net.js';

interface SecretPattern { name: string; regex: RegExp; severity: Severity }

/**
 * Patterns for credentials that are meaningful to find sitting in
 * public, unminified-enough JavaScript — the same class of bug tools like
 * TruffleHog look for, scoped here to same-origin script files a browser
 * already downloads when visiting the page.
 */
const PATTERNS: SecretPattern[] = [
    { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
    { name: 'Stripe live secret key', regex: /sk_live_[0-9a-zA-Z]{20,}/g, severity: 'critical' },
    { name: 'Stripe live restricted key', regex: /rk_live_[0-9a-zA-Z]{20,}/g, severity: 'critical' },
    { name: 'Google API key', regex: /AIza[0-9A-Za-z\-_]{35}/g, severity: 'high' },
    { name: 'Slack token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g, severity: 'high' },
    { name: 'GitHub personal access token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/g, severity: 'critical' },
    { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: 'critical' },
    { name: 'Generic hardcoded secret assignment', regex: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/gi, severity: 'high' },
];

const SCRIPT_SRC_RE = /<script\s[^>]*src\s*=\s*["']([^"']+)["']/gi;
const MAX_SCRIPTS = 8;
const MAX_MATCHES_REPORTED = 5;

function redact(value: string): string {
    if (value.length <= 10) return '•'.repeat(value.length);
    return `${value.slice(0, 6)}${'•'.repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
}

export const exposedSecretsCheck: CheckDefinition = {
    id: 'exposed-secrets',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const base = new URL(ctx.targetUrl);
        const scriptUrls = new Set<string>();

        for (const pageUrl of ctx.additionalPages) {
            const res = await safeFetch(pageUrl, { timeoutMs: ctx.timeoutMs }).catch(() => null);
            if (!res) continue;
            const html = await res.text();
            for (const match of html.matchAll(SCRIPT_SRC_RE)) {
                let scriptUrl: URL;
                try {
                    scriptUrl = new URL(match[1], pageUrl);
                } catch {
                    continue;
                }
                if (scriptUrl.hostname !== base.hostname) continue; // only same-origin bundles are "yours" to fix
                scriptUrls.add(scriptUrl.toString());
                if (scriptUrls.size >= MAX_SCRIPTS) break;
            }
            if (scriptUrls.size >= MAX_SCRIPTS) break;
        }

        const found = new Map<string, { severity: Severity; sample: string; url: string }>();
        await Promise.allSettled(Array.from(scriptUrls).map(async scriptUrl => {
            const res = await safeFetch(scriptUrl, { timeoutMs: ctx.timeoutMs, maxBodyBytes: 3_000_000 }).catch(() => null);
            if (!res || res.status !== 200) return;
            const body = await res.text();
            for (const pattern of PATTERNS) {
                const match = body.match(pattern.regex);
                if (match && !found.has(pattern.name)) {
                    found.set(pattern.name, { severity: pattern.severity, sample: redact(match[0]), url: scriptUrl });
                }
            }
        }));

        let reported = 0;
        for (const [name, { severity, sample, url }] of found) {
            if (reported >= MAX_MATCHES_REPORTED) break;
            reported += 1;
            findings.push({
                checkId: 'exposed-secrets',
                title: `Possible ${name} exposed in a public JavaScript file`,
                severity,
                impact: 'A live credential like this sitting in code anyone can download is often the single fastest way for an attacker to get into your accounts, databases, or cloud infrastructure — no hacking required, just reading the page source.',
                description: `A pattern matching a ${name} was found in a same-origin JavaScript file. This may be a false positive (test/placeholder value) — verify before rotating.`,
                evidence: sample,
                remediation: 'If real: rotate/revoke this credential immediately, then move it server-side (environment variable, secrets manager) instead of bundling it into client-side JavaScript. Client-side code is always public, regardless of minification.',
                references: ['https://owasp.org/www-community/vulnerabilities/Insecure_Storage_of_Sensitive_Information'],
                affectedUrl: url,
            });
        }

        return findings;
    },
};
