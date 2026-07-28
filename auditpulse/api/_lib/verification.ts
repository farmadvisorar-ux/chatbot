import { resolveTxt } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { safeFetch } from '../../lib/scanner/net.js';

/**
 * Full (active) audits are gated on proof the caller controls the target
 * domain — this is what keeps AuditPulse from being usable as a
 * point-and-shoot tool against sites the caller doesn't own. Two proof
 * methods are accepted, either of which is sufficient:
 *   1. A file at /.well-known/auditpulse-verify.txt containing the token.
 *   2. A DNS TXT record at _auditpulse-challenge.<hostname> containing the token.
 * The "quick check" tier (headers/TLS/cookies on the homepage) is exempt —
 * it performs the same single passive request any browser visiting the URL
 * already makes, so it carries no meaningfully greater risk than browsing.
 */
export function generateVerificationToken(): string {
    return randomBytes(16).toString('hex');
}

export async function verifyDomainOwnership(hostname: string, token: string): Promise<{ verified: boolean; method?: string }> {
    try {
        const res = await safeFetch(`https://${hostname}/.well-known/auditpulse-verify.txt`, { timeoutMs: 5000 });
        if (res.status === 200) {
            const body = (await res.text()).trim();
            if (body === token) return { verified: true, method: 'well-known-file' };
        }
    } catch {
        // fall through to DNS method
    }

    try {
        const records = await resolveTxt(`_auditpulse-challenge.${hostname}`);
        const flat = records.map(parts => parts.join('').trim());
        if (flat.includes(token)) return { verified: true, method: 'dns-txt' };
    } catch {
        // no record present
    }

    return { verified: false };
}
