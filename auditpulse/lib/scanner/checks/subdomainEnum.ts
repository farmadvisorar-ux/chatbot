import type { CheckDefinition, Finding } from '../types.js';

interface CrtShEntry { name_value: string }

/**
 * Passive-only subdomain discovery via crt.sh (public Certificate
 * Transparency log search). No requests are made to the target or any
 * subdomain itself — this only queries a public third-party log, the same
 * way `curl https://crt.sh/?q=...` does.
 */
export const subdomainEnumCheck: CheckDefinition = {
    id: 'subdomain-exposure',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(ctx.timeoutMs, 6000));
        let entries: CrtShEntry[] = [];
        try {
            const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(ctx.hostname)}&output=json`, {
                signal: controller.signal,
                headers: { 'User-Agent': 'AuditPulseBot/1.0' },
            });
            if (res.ok) entries = await res.json() as CrtShEntry[];
        } catch {
            return findings; // crt.sh is best-effort and occasionally rate-limits; fail silently
        } finally {
            clearTimeout(timer);
        }

        const subdomains = new Set<string>();
        for (const entry of entries) {
            for (const name of entry.name_value.split('\n')) {
                const clean = name.trim().toLowerCase().replace(/^\*\./, '');
                if (clean.endsWith(ctx.hostname) && clean !== ctx.hostname) subdomains.add(clean);
            }
        }

        const interesting = Array.from(subdomains).filter(name =>
            /^(dev|staging|test|uat|internal|admin|vpn|old|backup|beta|demo|preprod|sandbox)[.-]/.test(name),
        );

        if (interesting.length) {
            findings.push({
                checkId: 'subdomain-exposure',
                title: 'Non-production subdomains discovered in public certificate logs',
                severity: 'low',
                description: `Certificate Transparency logs reveal ${interesting.length} subdomain(s) that look like development/staging/internal environments. These are often less hardened than production and worth reviewing for public exposure.`,
                evidence: interesting.slice(0, 15).join(', '),
                remediation: 'Confirm these environments require authentication, are not indexed, and do not expose debug endpoints or non-production data publicly. Decommission ones no longer in use.',
                references: ['https://crt.sh/'],
            });
        } else if (subdomains.size > 0) {
            findings.push({
                checkId: 'subdomain-exposure',
                title: `${subdomains.size} subdomain(s) found in public certificate logs`,
                severity: 'info',
                description: 'Listed for awareness — review that each still resolves to something intentionally public.',
                evidence: Array.from(subdomains).slice(0, 20).join(', '),
                remediation: 'Periodically audit issued certificates for subdomains that are no longer in active, intended use.',
                references: ['https://crt.sh/'],
            });
        }

        return findings;
    },
};
