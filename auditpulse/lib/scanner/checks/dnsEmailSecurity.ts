import { resolveTxt, resolveCaa } from 'node:dns/promises';
import type { CheckDefinition, Finding } from '../types.js';

/** Passive DNS TXT/CAA lookups — the same lookups any mail server or CA already performs. */
export const dnsEmailSecurityCheck: CheckDefinition = {
    id: 'dns-email-security',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];

        const txtRecords = await resolveTxt(ctx.hostname).then(
            records => records.map(parts => parts.join('')),
            () => [] as string[],
        );

        const spf = txtRecords.find(r => r.startsWith('v=spf1'));
        if (!spf) {
            findings.push({
                checkId: 'dns-email-security',
                title: 'No SPF record found',
                severity: 'medium',
                impact: 'Anyone can send emails that look like they came from your domain — a classic setup for phishing your customers or employees using your own good name and reputation.',
                description: 'Without an SPF record, receiving mail servers have no way to verify that mail claiming to be From this domain was sent by an authorized server, making it easier to spoof.',
                remediation: 'Publish a TXT record at the apex domain, e.g. `v=spf1 include:_spf.yourmailprovider.com -all`.',
                references: ['https://www.rfc-editor.org/rfc/rfc7208'],
            });
        } else if (!/[-~]all\s*$/.test(spf.trim())) {
            findings.push({
                checkId: 'dns-email-security',
                title: 'SPF record does not end in a strict qualifier',
                severity: 'low',
                impact: 'Your SPF record exists but doesn\'t clearly say "reject anything not on this list," which weakens the spoofing protection it\'s supposed to provide.',
                description: `SPF record ("${spf.slice(0, 120)}") does not end with -all or ~all, so it does not clearly reject mail from unauthorized senders.`,
                remediation: 'End the SPF record with `-all` (hard fail) once all legitimate senders are enumerated.',
            });
        }

        const dmarc = await resolveTxt(`_dmarc.${ctx.hostname}`).then(
            records => records.map(parts => parts.join('')).find(r => r.startsWith('v=DMARC1')),
            () => undefined,
        );
        if (!dmarc) {
            findings.push({
                checkId: 'dns-email-security',
                title: 'No DMARC record found',
                severity: 'medium',
                impact: 'Even if you have SPF, without DMARC you have no visibility into who\'s spoofing your domain and no enforced policy stopping their emails from reaching your customers\' inboxes looking legitimate.',
                description: 'Without DMARC, there is no policy telling receiving mail servers what to do with mail that fails SPF/DKIM, and no reporting visibility into spoofing attempts using this domain.',
                remediation: 'Publish a TXT record at _dmarc.<domain>, e.g. `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com`, then move to `p=reject` once reports look clean.',
                references: ['https://www.rfc-editor.org/rfc/rfc7489'],
            });
        } else if (/p=none/i.test(dmarc)) {
            findings.push({
                checkId: 'dns-email-security',
                title: 'DMARC policy is set to "none" (monitor only)',
                severity: 'low',
                impact: 'You\'re collecting data on spoofing attempts but not actually blocking any of them — a spoofed email using your domain still lands in the recipient\'s inbox exactly as if it were real.',
                description: 'DMARC is published but set to p=none, so spoofed mail is not actually rejected or quarantined — only reported.',
                evidence: dmarc.slice(0, 200),
                remediation: 'Move to `p=quarantine` and eventually `p=reject` once DMARC aggregate reports confirm no legitimate mail is failing.',
            });
        }

        const caa = await resolveCaa(ctx.hostname).catch(() => []);
        if (!caa.length) {
            findings.push({
                checkId: 'dns-email-security',
                title: 'No CAA record found',
                severity: 'info',
                impact: 'A minor extra layer missing — without it, if any certificate authority anywhere in the world is tricked or compromised, it could issue a valid certificate for your domain to someone else.',
                description: 'Without a CAA record, any publicly trusted certificate authority can issue certificates for this domain.',
                remediation: 'Publish a CAA record restricting issuance to your chosen CA(s), e.g. `0 issue "letsencrypt.org"`.',
                references: ['https://www.rfc-editor.org/rfc/rfc8659'],
            });
        }

        return findings;
    },
};
