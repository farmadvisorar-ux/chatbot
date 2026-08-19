import type { CheckDefinition, Finding, Severity } from '../types.js';
import { safeFetch } from '../net.js';

/**
 * Well-known paths that commonly leak secrets or internal state when a
 * server is misconfigured. Every probe is a single, harmless GET — the same
 * request a browser makes for any URL — capped at a handful of bytes; there
 * is no brute forcing, no destructive method, nothing beyond what "visit
 * this URL" already means.
 */
const CANDIDATES: Array<{ path: string; title: string; severity: Severity; impact: string; remediation: string }> = [
    { path: '/.env', title: 'Exposed .env file', severity: 'critical', impact: 'This file typically holds database passwords, API keys, and secret tokens — anyone who finds it has effectively the same access to your systems as you do.', remediation: 'Remove .env from the web root and ensure the web server config blocks dotfiles. Rotate any credentials it contained.' },
    { path: '/.git/config', title: 'Exposed .git directory', severity: 'critical', impact: 'Your entire source code history is downloadable, including old commits — which very often contain secrets that were later "removed" but never rotated, plus your full application logic for finding other bugs.', remediation: 'Remove the .git directory from the deployed web root, or block access to /.git/ in the web server config. Treat any secrets in the repo history as compromised.' },
    { path: '/.git/HEAD', title: 'Exposed .git directory', severity: 'critical', impact: 'Your entire source code history is downloadable, including old commits — which very often contain secrets that were later "removed" but never rotated, plus your full application logic for finding other bugs.', remediation: 'Remove the .git directory from the deployed web root, or block access to /.git/ in the web server config.' },
    { path: '/.aws/credentials', title: 'Exposed AWS credentials file', severity: 'critical', impact: 'Whoever finds this can log into your AWS account directly — spin up servers on your bill, read your data, or delete it, depending on what that key can do.', remediation: 'Remove this file from the web root immediately and rotate the exposed AWS keys.' },
    { path: '/wp-config.php.bak', title: 'Exposed WordPress config backup', severity: 'critical', impact: 'This backup file contains your database password and secret authentication keys in plain text, handing over full control of your WordPress site and its database.', remediation: 'Delete backup files (.bak, .old, ~) from the web root; they bypass PHP execution and are served as plain text.' },
    { path: '/config.json', title: 'Exposed config.json', severity: 'high', impact: 'Application configuration files often contain API keys or internal service URLs that were never meant to be public.', remediation: 'Move application configuration outside the web root or restrict access to it.' },
    { path: '/backup.sql', title: 'Exposed database backup', severity: 'critical', impact: 'This is very likely a full copy of your database — customer records, password hashes, everything — downloadable by anyone who finds the link.', remediation: 'Remove database dumps from the web root. Store backups outside any publicly served directory.' },
    { path: '/backup.zip', title: 'Exposed backup archive', severity: 'high', impact: 'A full site or database backup like this usually contains everything an attacker needs — source code, configuration, and often credentials — in one convenient download.', remediation: 'Remove backup archives from the web root.' },
    { path: '/.htpasswd', title: 'Exposed .htpasswd file', severity: 'high', impact: 'This file holds the username/password hashes protecting whatever area of your site you thought was locked down — an attacker can crack weak passwords offline at their leisure.', remediation: 'Store .htpasswd outside the web root and ensure the server config denies access to it.' },
    { path: '/.npmrc', title: 'Exposed .npmrc file', severity: 'high', impact: 'This often contains a private registry auth token, which could let someone publish malicious versions of your private packages or access your paid registry account.', remediation: 'Remove .npmrc from the deployed web root; rotate any registry auth tokens it contains.' },
    { path: '/docker-compose.yml', title: 'Exposed docker-compose.yml', severity: 'medium', impact: 'This maps out your internal services, ports, and often embeds environment variables/credentials — a free blueprint of your infrastructure for anyone planning an attack.', remediation: 'Remove deployment/config files from the web root; they often reveal internal service topology and credentials.' },
    { path: '/.DS_Store', title: 'Exposed .DS_Store file', severity: 'low', impact: 'This macOS system file can reveal the names of other files and folders on the server that aren\'t otherwise linked from the site, giving an attacker a map of what else to look for.', remediation: 'Remove .DS_Store files before deploying; they can leak a directory listing of local file names.' },
    { path: '/server-status', title: 'Apache server-status exposed', severity: 'medium', impact: 'This page shows live requests hitting your server in real time, including visitor IP addresses and the URLs they\'re requesting — a privacy leak and a recon tool in one.', remediation: 'Restrict /server-status to trusted internal IPs (or disable mod_status) in the Apache config.' },
    { path: '/actuator/health', title: 'Spring Boot Actuator endpoint exposed', severity: 'medium', impact: 'Depending on configuration, Actuator endpoints can expose environment variables, internal beans, or even a way to interact with the running application — far more than a simple health check should reveal.', remediation: 'Restrict Spring Boot Actuator endpoints (management.endpoints.web.exposure) to internal networks or require authentication.' },
    { path: '/.vscode/sftp.json', title: 'Exposed editor SFTP credentials file', severity: 'critical', impact: 'This file typically contains the login credentials a developer uses to directly upload files to your production server — anyone who finds it can deploy files as if they were that developer.', remediation: 'Remove editor config directories (.vscode, .idea) from the deployed web root; rotate any credentials found.' },
    { path: '/elmah.axd', title: 'Exposed ELMAH error log (ASP.NET)', severity: 'high', impact: 'Error logs like this routinely capture session cookies, form data, and stack traces from real user requests — a goldmine for hijacking sessions or understanding exactly how your app works internally.', remediation: 'Restrict or remove the ELMAH endpoint in production; it can expose stack traces, session ids, and request data.' },
    { path: '/phpinfo.php', title: 'Exposed phpinfo() page', severity: 'medium', impact: 'This dumps your entire server configuration — software versions, file paths, loaded modules — everything an attacker needs to look up known exploits for your exact setup.', remediation: 'Remove phpinfo.php from production; it discloses detailed server configuration useful for exploitation.' },
    { path: '/.well-known/security.txt', title: '', severity: 'info', impact: '', remediation: '' }, // handled specially below (presence is GOOD)
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
                        impact: 'A researcher who spots a real vulnerability on your site has no obvious way to tell you responsibly — they may give up, post it publicly, or not bother reaching out at all.',
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
                    impact: candidate.impact,
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
