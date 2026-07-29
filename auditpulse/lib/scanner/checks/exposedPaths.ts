import type { CheckDefinition, Finding, Severity } from '../types.js';
import { safeFetch } from '../net.js';

/**
 * Well-known paths that commonly leak secrets or internal state when a
 * server is misconfigured. Every probe is a single, harmless GET — the same
 * request a browser makes for any URL — capped at a handful of bytes; there
 * is no brute forcing, no destructive method, nothing beyond what "visit
 * this URL" already means.
 */
const CANDIDATES: Array<{ path: string; title: string; severity: Severity; remediation: string }> = [
    { path: '/.env', title: 'Exposed .env file', severity: 'critical', remediation: 'Remove .env from the web root and ensure the web server config blocks dotfiles. Rotate any credentials it contained.' },
    { path: '/.git/config', title: 'Exposed .git directory', severity: 'critical', remediation: 'Remove the .git directory from the deployed web root, or block access to /.git/ in the web server config. Treat any secrets in the repo history as compromised.' },
    { path: '/.git/HEAD', title: 'Exposed .git directory', severity: 'critical', remediation: 'Remove the .git directory from the deployed web root, or block access to /.git/ in the web server config.' },
    { path: '/.aws/credentials', title: 'Exposed AWS credentials file', severity: 'critical', remediation: 'Remove this file from the web root immediately and rotate the exposed AWS keys.' },
    { path: '/wp-config.php.bak', title: 'Exposed WordPress config backup', severity: 'critical', remediation: 'Delete backup files (.bak, .old, ~) from the web root; they bypass PHP execution and are served as plain text.' },
    { path: '/config.json', title: 'Exposed config.json', severity: 'high', remediation: 'Move application configuration outside the web root or restrict access to it.' },
    { path: '/backup.sql', title: 'Exposed database backup', severity: 'critical', remediation: 'Remove database dumps from the web root. Store backups outside any publicly served directory.' },
    { path: '/backup.zip', title: 'Exposed backup archive', severity: 'high', remediation: 'Remove backup archives from the web root.' },
    { path: '/.htpasswd', title: 'Exposed .htpasswd file', severity: 'high', remediation: 'Store .htpasswd outside the web root and ensure the server config denies access to it.' },
    { path: '/.npmrc', title: 'Exposed .npmrc file', severity: 'high', remediation: 'Remove .npmrc from the deployed web root; rotate any registry auth tokens it contains.' },
    { path: '/docker-compose.yml', title: 'Exposed docker-compose.yml', severity: 'medium', remediation: 'Remove deployment/config files from the web root; they often reveal internal service topology and credentials.' },
    { path: '/.DS_Store', title: 'Exposed .DS_Store file', severity: 'low', remediation: 'Remove .DS_Store files before deploying; they can leak a directory listing of local file names.' },
    { path: '/server-status', title: 'Apache server-status exposed', severity: 'medium', remediation: 'Restrict /server-status to trusted internal IPs (or disable mod_status) in the Apache config.' },
    { path: '/actuator/health', title: 'Spring Boot Actuator endpoint exposed', severity: 'medium', remediation: 'Restrict Spring Boot Actuator endpoints (management.endpoints.web.exposure) to internal networks or require authentication.' },
    { path: '/.vscode/sftp.json', title: 'Exposed editor SFTP credentials file', severity: 'critical', remediation: 'Remove editor config directories (.vscode, .idea) from the deployed web root; rotate any credentials found.' },
    { path: '/elmah.axd', title: 'Exposed ELMAH error log (ASP.NET)', severity: 'high', remediation: 'Restrict or remove the ELMAH endpoint in production; it can expose stack traces, session ids, and request data.' },
    { path: '/phpinfo.php', title: 'Exposed phpinfo() page', severity: 'medium', remediation: 'Remove phpinfo.php from production; it discloses detailed server configuration useful for exploitation.' },
    { path: '/.well-known/security.txt', title: '', severity: 'info', remediation: '' }, // handled specially below (presence is GOOD)
];

export const exposedPathsCheck: CheckDefinition = {
    id: 'exposed-paths',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const base = ctx.targetUrl.replace(/\/$/, '');

        const results = await Promise.allSettled(
            CANDIDATES.map(async candidate => {
                const url = base + candidate.path;
                const res = await safeFetch(url, { timeoutMs: Math.min(ctx.timeoutMs, 4000) });
                return { candidate, res };
            }),
        );

        for (const result of results) {
            if (result.status !== 'fulfilled') continue;
            const { candidate, res } = result.value;

            if (candidate.path === '/.well-known/security.txt') {
                if (res.status !== 200) {
                    findings.push({
                        checkId: 'exposed-paths',
                        title: 'No security.txt published',
                        severity: 'info',
                        description: 'The site does not publish /.well-known/security.txt, making it harder for researchers to report vulnerabilities responsibly.',
                        remediation: 'Publish a security.txt per RFC 9116 with a contact address for vulnerability reports.',
                        references: ['https://securitytxt.org/'],
                        affectedUrl: base + candidate.path,
                    });
                }
                continue;
            }

            if (res.status === 200) {
                const body = await res.text().catch(() => '');
                // A soft-404 (custom error page returned with 200) shouldn't count.
                const looksLikeRealHtml404 = /<html/i.test(body) && /(not found|404|page.{0,15}(missing|does not exist))/i.test(body) && body.length < 4000;
                if (looksLikeRealHtml404) continue;

                findings.push({
                    checkId: 'exposed-paths',
                    title: candidate.title,
                    severity: candidate.severity,
                    description: `A GET request to ${candidate.path} returned HTTP 200, indicating this file is publicly accessible.`,
                    evidence: body.slice(0, 300),
                    remediation: candidate.remediation,
                    affectedUrl: base + candidate.path,
                });
            }
        }

        return findings;
    },
};
