import type { VerticalInfo } from './verticals';

export interface GtmStrategy {
    buyerProfile: string;
    pitchAngle: string;
    targetSignals: string[];
}

/**
 * Template-based go-to-market guidance: who is realistically a good
 * outbound target and why, and what to look for when prospecting.
 *
 * Deliberately does NOT invent specific real company names or counts
 * ("14 Series-A companies using...") — there's no data source behind
 * this app that could back that up truthfully, and a plausible-sounding
 * fabricated list would be actively misleading. This gives you the
 * targeting criteria instead; running an actual prospect list is a
 * research step you (or a tool with real company-database access) do
 * next.
 */
export function generateGtmStrategy(params: {
    label: string;
    tld: string;
    vertical: VerticalInfo;
    keywordTier: string | null;
    compositionQuality: 'strong' | 'moderate' | 'weak';
}): GtmStrategy {
    const { label, tld, vertical, keywordTier, compositionQuality } = params;

    const heatPhrase =
        vertical.heat === 'high'
            ? 'a well-capitalized'
            : vertical.heat === 'medium'
              ? 'a moderately funded'
              : 'a budget-conscious';

    const buyerProfile =
        `${vertical.heat === 'high' ? 'Best-fit buyers are' : 'Realistic buyers are'} operators in ${heatPhrase} ` +
        `${vertical.label} niche who are currently on a weaker version of this name — a longer, hyphenated, or ` +
        `multi-word domain, a weaker extension (.io, .co, .net, .xyz) for the same term, or a name that doesn't ` +
        `match their brand at all. ${vertical.note}`;

    const pitchAngle = compositionQuality === 'strong'
        ? `Lead with brand clarity and type-in traffic: "${label}.${tld}" is short, memorable, and free of the ` +
          `qualifiers (get-, try-, -app, -hq) that signal a company hasn't locked down its category yet.`
        : compositionQuality === 'moderate'
          ? `Lead with immediate availability and category relevance — this won't win on brandability alone, but it ` +
            `removes the friction of a hyphen, extra word, or off-brand extension for a buyer already in this space.`
          : `This is a longer-tail name; the pitch is narrow relevance to a specific buyer's exact product/service ` +
            `naming, not broad brand appeal — target businesses whose current name is a near-exact match to this string.`;

    const targetSignals = [
        `Companies operating on a hyphenated or multi-word variant of "${label}" today`,
        `Businesses using a weaker extension (.io, .co, .net, .xyz, .site) for essentially this same term`,
        vertical.heat !== 'low'
            ? `Recently-launched or recently-rebranded companies in the ${vertical.label} space — a rebrand or new funding round is the natural trigger to upgrade a domain`
            : `Local or niche operators in this space where a clean, short name signals more credibility than their current one`,
        keywordTier ? `Businesses whose core offering is literally "${label}" — the keyword match itself is the pitch` : `Businesses where this term is closely adjacent to their core offering, not just a loose association`,
    ];

    return { buyerProfile, pitchAngle, targetSignals };
}
