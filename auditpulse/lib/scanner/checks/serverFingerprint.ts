import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

export const serverFingerprintCheck: CheckDefinition = {
    id: 'server-fingerprint',
    tier: 'quick',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, { timeoutMs: ctx.timeoutMs });

        const server = res.headers.get('server');
        if (server && /\d/.test(server)) {
            findings.push({
                checkId: 'server-fingerprint',
                title: 'Server header discloses software version',
                severity: 'info',
                impact: 'This tells anyone exactly which software version you\'re running, so if a new vulnerability is published for that exact version, attackers scanning the web can find you as a target automatically.',
                description: `The Server header ("${server}") reveals specific software/version information, which helps an attacker match known CVEs to your stack.`,
                evidence: server,
                remediation: 'Configure the web server to omit or genericize the Server header (e.g. `ServerTokens Prod` on Apache, `server_tokens off;` on nginx).',
                references: ['https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/02-Fingerprint_Web_Server'],
            });
        }

        const poweredBy = res.headers.get('x-powered-by');
        if (poweredBy) {
            findings.push({
                checkId: 'server-fingerprint',
                title: 'X-Powered-By header discloses framework/version',
                severity: 'info',
                impact: 'Same idea as the Server header — it narrows down exactly which framework and version to look up known exploits for.',
                description: `The X-Powered-By header ("${poweredBy}") reveals framework/runtime details useful for targeting known vulnerabilities.`,
                evidence: poweredBy,
                remediation: 'Disable the X-Powered-By header (e.g. `app.disable(\'x-powered-by\')` in Express, `expose_php = Off` in php.ini).',
            });
        }

        for (const name of ['x-aspnet-version', 'x-aspnetmvc-version', 'x-generator', 'x-drupal-cache']) {
            const value = res.headers.get(name);
            if (value) {
                findings.push({
                    checkId: 'server-fingerprint',
                    title: `${name} header discloses platform details`,
                    severity: 'info',
                    impact: 'Small detail, but it\'s one more piece of the puzzle that helps an attacker fingerprint your exact stack before deciding how to try to break in.',
                    description: `The "${name}" header ("${value}") reveals platform information usable for reconnaissance.`,
                    evidence: value,
                    remediation: `Remove or suppress the ${name} header in production.`,
                });
            }
        }

        return findings;
    },
};
