import dns from 'node:dns/promises';
import { getTldInfo } from './tld-table';

export interface AlternativeTldItem {
    tld: string;
    domain: string;
    isCurrent: boolean;
    authority: number;
    tldLabel: string;
    estMidUsd: number;
    multiplierVsCurrent: number;
    status: 'active-resolving' | 'unassigned-or-available';
    actionUrl: string;
    actionLabel: string;
}

export interface AlternativeTldsResult {
    alternatives: AlternativeTldItem[];
    checkedCount: number;
    activeCount: number;
    collisionDensityScore: number; // 0-100
    densityRating: 'High Commercial Density' | 'Moderate Extension Footprint' | 'Open Brand Landscape';
    strategicRationale: string;
}

const CORE_EXTENSIONS = ['com', 'ai', 'io', 'co', 'org', 'net', 'app', 'xyz'];

async function checkDnsStatus(domain: string, timeoutMs = 1500): Promise<boolean> {
    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
    );

    try {
        // Try A record first
        await Promise.race([dns.resolve4(domain), timeoutPromise]);
        return true;
    } catch {
        try {
            // Fall back to NS delegation check
            await Promise.race([dns.resolveNs(domain), timeoutPromise]);
            return true;
        } catch {
            return false;
        }
    }
}

export async function checkAlternativeTlds(params: {
    label: string;
    currentTld: string;
    baseLinguisticUsd: number;
    keywordMultiplier: number;
    effectiveAgeYears: number;
    currentMidUsd: number;
}): Promise<AlternativeTldsResult> {
    const { label, currentTld, baseLinguisticUsd, keywordMultiplier, effectiveAgeYears, currentMidUsd } = params;

    // Ensure current TLD is in list if not already
    const extensionsToScan = Array.from(new Set([currentTld.toLowerCase(), ...CORE_EXTENSIONS])).slice(0, 8);

    const ageMultiplier = effectiveAgeYears > 0 ? 1 + Math.min(0.4, effectiveAgeYears * 0.02) : 1;

    const lookupPromises = extensionsToScan.map(async (tld) => {
        const domain = `${label}.${tld}`;
        const isCurrent = tld.toLowerCase() === currentTld.toLowerCase();
        const tldInfo = getTldInfo(tld);

        // Estimate value for this extension
        const rawEst = baseLinguisticUsd * tldInfo.multiplier * keywordMultiplier * ageMultiplier;
        const estMidUsd = Math.max(50, Math.round(rawEst));

        const multiplierVsCurrent = currentMidUsd > 0
            ? Number((estMidUsd / currentMidUsd).toFixed(2))
            : 1.0;

        let status: 'active-resolving' | 'unassigned-or-available';
        if (isCurrent) {
            status = 'active-resolving';
        } else {
            const hasDns = await checkDnsStatus(domain);
            status = hasDns ? 'active-resolving' : 'unassigned-or-available';
        }

        let actionUrl = `/valuation/${encodeURIComponent(domain)}`;
        let actionLabel = 'Evaluate →';
        if (!isCurrent && status === 'unassigned-or-available') {
            actionUrl = `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
            actionLabel = 'Register ↗';
        } else if (isCurrent) {
            actionUrl = '#';
            actionLabel = 'Current Target';
        }

        return {
            tld,
            domain,
            isCurrent,
            authority: tldInfo.authority,
            tldLabel: tldInfo.label,
            estMidUsd,
            multiplierVsCurrent,
            status,
            actionUrl,
            actionLabel,
        };
    });

    const alternatives = await Promise.all(lookupPromises);

    const checkedCount = alternatives.length;
    const activeCount = alternatives.filter((a) => a.status === 'active-resolving').length;
    const collisionDensityScore = Math.round((activeCount / checkedCount) * 100);

    let densityRating: AlternativeTldsResult['densityRating'] = 'Open Brand Landscape';
    let strategicRationale = '';

    if (collisionDensityScore >= 70) {
        densityRating = 'High Commercial Density';
        strategicRationale =
            `With ${activeCount} of ${checkedCount} core extensions currently registered and resolving, "${label}" carries exceptional commercial validation. Operators on sibling TLDs (.${extensionsToScan.filter((t) => t !== currentTld).slice(0, 3).join(', .')}) represent primary high-intent buyers seeking brand defense or a category upgrade.`;
    } else if (collisionDensityScore >= 40) {
        densityRating = 'Moderate Extension Footprint';
        strategicRationale =
            `Multiple sibling extensions are already taken, confirming healthy sector demand for "${label}". There is clear inbound interest, while select secondary extensions remain open for developer or niche branding.`;
    } else {
        densityRating = 'Open Brand Landscape';
        strategicRationale =
            `Most alternative extensions for "${label}" are unassigned or inactive. This offers maximum greenfield flexibility for a new venture, but secondary-market upgrade pressure from other TLD operators will be lower.`;
    }

    return {
        alternatives,
        checkedCount,
        activeCount,
        collisionDensityScore,
        densityRating,
        strategicRationale,
    };
}
