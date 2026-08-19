import { connect, type TLSSocket } from 'node:tls';
import type { CheckDefinition, Finding } from '../types.js';
import { assertPublicHost } from '../net.js';

function inspectTls(hostname: string, timeoutMs: number): Promise<{
    protocol: string | null;
    authorized: boolean;
    authorizationError?: string;
    validTo: string;
    issuer: string;
} | null> {
    return new Promise(resolve => {
        let settled = false;
        const socket: TLSSocket = connect(
            { host: hostname, port: 443, servername: hostname, timeout: timeoutMs },
            () => {
                if (settled) return;
                settled = true;
                const cert = socket.getPeerCertificate();
                const issuerField = cert?.issuer?.O ?? cert?.issuer?.CN ?? 'unknown';
                resolve({
                    protocol: socket.getProtocol(),
                    authorized: socket.authorized,
                    authorizationError: socket.authorizationError?.toString(),
                    validTo: cert?.valid_to ?? '',
                    issuer: Array.isArray(issuerField) ? issuerField.join(', ') : issuerField,
                });
                socket.end();
            },
        );
        socket.setTimeout(timeoutMs, () => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(null);
        });
        socket.on('error', () => {
            if (settled) return;
            settled = true;
            resolve(null);
        });
    });
}

/**
 * Raw TLS handshake inspection: protocol version, certificate validity and
 * expiry. A single connection — as passive as a browser's own handshake.
 */
export const tlsCheck: CheckDefinition = {
    id: 'tls-config',
    tier: 'quick',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        await assertPublicHost(ctx.hostname);
        const info = await inspectTls(ctx.hostname, ctx.timeoutMs);

        if (!info) {
            findings.push({
                checkId: 'tls-config',
                title: 'HTTPS is not available on port 443',
                severity: 'high',
                impact: 'Every password, form submission, and page a visitor loads can be read or altered in transit by anyone sharing their network — there is no encryption protecting any of it.',
                description: 'Could not complete a TLS handshake with the target on port 443. Visitors may be served the site over unencrypted HTTP.',
                remediation: 'Install a valid TLS certificate and serve the site over HTTPS on port 443.',
                references: ['https://owasp.org/www-project-transport-layer-protection-cheat-sheet/'],
            });
            return findings;
        }

        if (info.protocol === 'TLSv1' || info.protocol === 'TLSv1.1') {
            findings.push({
                checkId: 'tls-config',
                title: `Obsolete TLS protocol in use (${info.protocol})`,
                severity: 'high',
                impact: 'This older encryption standard has known weaknesses that let a skilled attacker on the network potentially decrypt traffic — most modern browsers already refuse to connect using it, showing visitors a hard error.',
                description: `The server negotiated ${info.protocol}, which is deprecated and no longer considered secure (removed from all major browsers).`,
                remediation: 'Disable TLS 1.0 and 1.1 in the web server / load balancer configuration; require TLS 1.2 or 1.3 only.',
                references: ['https://datatracker.ietf.org/doc/html/rfc8996'],
            });
        }

        if (!info.authorized) {
            findings.push({
                checkId: 'tls-config',
                title: 'TLS certificate is not trusted',
                severity: 'critical',
                impact: 'Visitors land on a full-page "Your connection is not private" warning before they can even see your site — most will leave immediately, and the ones who don\'t have no real encryption guarantee anyway.',
                description: `The certificate chain failed validation: ${info.authorizationError || 'unknown reason'}. Browsers will show visitors a security warning.`,
                remediation: 'Install a certificate issued by a publicly trusted CA (e.g. via Let\'s Encrypt) and ensure the full chain (including intermediates) is served.',
                references: ['https://letsencrypt.org/getting-started/'],
            });
        }

        if (info.validTo) {
            const daysLeft = Math.floor((new Date(info.validTo).getTime() - Date.now()) / 86_400_000);
            if (daysLeft < 0) {
                findings.push({
                    checkId: 'tls-config',
                    title: 'TLS certificate has expired',
                    severity: 'critical',
                    impact: 'Every visitor now sees a hard security warning telling them the site is unsafe — this is actively turning away traffic right now, not a future risk.',
                    description: `The certificate expired on ${info.validTo}.`,
                    remediation: 'Renew the certificate immediately and set up automated renewal (e.g. certbot with a cron/systemd timer) so this cannot recur.',
                });
            } else if (daysLeft < 14) {
                findings.push({
                    checkId: 'tls-config',
                    title: 'TLS certificate expires soon',
                    severity: 'medium',
                    impact: 'Miss the renewal and every visitor starts seeing a security warning the moment it lapses — the same outage as an expired certificate, just not yet.',
                    description: `The certificate expires in ${daysLeft} day(s), on ${info.validTo}.`,
                    remediation: 'Renew the certificate and set up automated renewal to avoid an outage.',
                });
            }
        }

        return findings;
    },
};
