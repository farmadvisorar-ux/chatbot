import type { VerticalInfo } from './verticals';
import { formatUsd, formatUsdExact } from '../format';

export interface BuyerProfileArchetype {
    title: string;
    targetSegment: string;
    urgency: 'High Priority' | 'Strategic / Medium' | 'Opportunistic';
    acquisitionRationale: string;
    suggestedSearchQueries: string[];
}

export interface OutboundPitchTemplate {
    id: string;
    name: string;
    subjectLine: string;
    bodyText: string;
    bestFor: string;
}

export interface LeadProspectorResult {
    buyerProfiles: BuyerProfileArchetype[];
    pitchTemplates: OutboundPitchTemplate[];
    outboundAngle: string;
    recommendedOutreachChannel: 'LinkedIn InMail + Direct Founder Email' | 'Corporate M&A / VP BizDev Email' | 'Wholesale Broker Network';
}

export function generateLeadProspector(params: {
    domain: string;
    label: string;
    tld: string;
    vertical: VerticalInfo;
    midUsd: number;
    recommendedBin: number;
    monthlyLease24: number;
    isSingleWord: boolean;
    compositionQuality: 'strong' | 'moderate' | 'weak';
}): LeadProspectorResult {
    const {
        domain,
        label,
        tld,
        vertical,
        midUsd,
        recommendedBin,
        monthlyLease24,
        isSingleWord,
        compositionQuality,
    } = params;

    const binFormatted = formatUsd(recommendedBin);
    const monthlyFormatted = formatUsdExact(monthlyLease24);
    const isCom = tld === 'com';

    // 1. Build targeted buyer archetypes
    const buyerProfiles: BuyerProfileArchetype[] = [
        {
            title: isCom ? 'Direct Brand Upgrade Candidates' : 'Sector Innovators & Tech Operators',
            targetSegment: isCom
                ? `Companies operating on secondary prefixes (get${label}, try${label}, the${label}) or alternative extensions (${label}.io, ${label}.co, ${label}.ai).`
                : `Emerging startups, developer platforms, or specialized projects specifically looking for .${tld} positioning in ${vertical.label}.`,
            urgency: 'High Priority',
            acquisitionRationale: isCom
                ? `Eliminates customer confusion, prevents critical email leakage to third parties, lowers paid ad customer acquisition costs (CAC), and establishes category authority.`
                : `Secures a clean, exact-match digital identity without paying mid-six-figure .com aftermarket premiums.`,
            suggestedSearchQueries: [
                `"${label}" ("get" OR "try" OR "app" OR "hq") -site:${domain}`,
                `site:linkedin.com/company "${label}" ${vertical.label}`,
                `site:crunchbase.com/organization "${label}"`,
            ],
        },
        {
            title: 'Strategic Corporate Acquirers & Category Leaders',
            targetSegment: `Funded scaleups and enterprise corporations in the ${vertical.label} industry (${vertical.heat === 'high' ? 'High Deal Volume' : 'Steady Enterprise Sector'}).`,
            urgency: 'Strategic / Medium',
            acquisitionRationale: `Defensive category acquisition. Prevents a direct competitor or disruptive newcomer from weaponizing "${label}" to capture organic search traffic and mindshare.`,
            suggestedSearchQueries: [
                `"top ${vertical.label} companies 2026"`,
                `site:techcrunch.com "${vertical.label}" "funding"`,
                `site:pitchbook.com "${label}"`,
            ],
        },
        {
            title: 'Private Equity Roll-Ups & Portfolio Aggregators',
            targetSegment: `Holding companies, franchise networks, or private equity groups actively consolidating regional or niche ${vertical.label} businesses.`,
            urgency: 'Opportunistic',
            acquisitionRationale: `Umbrella branding asset. Serves as a unified consumer portal or digital storefront for an entire portfolio of acquired service providers.`,
            suggestedSearchQueries: [
                `"${vertical.label}" "private equity" OR "acquired by"`,
                `"${label}" franchise OR "family of brands"`,
            ],
        },
    ];

    // 2. Build high-converting ready-to-send outbound cold pitch templates
    const pitchTemplates: OutboundPitchTemplate[] = [
        {
            id: 'brand-upgrade',
            name: 'The Direct Brand Upgrade Pitch',
            bestFor: 'Targeting founders, CEOs, or Marketing leaders currently operating on a weaker prefix or extension.',
            subjectLine: `Acquisition inquiry: ${domain} (Brand Upgrade for your team)`,
            bodyText: `Hi [Founder / CMO Name],

I noticed your team is doing impressive work in the ${vertical.label} space, currently operating online with an alternative domain structure.

I am reaching out because I hold the exact-match digital asset ${domain}.

Operating on the pure, unfiltered exact match (${domain}) provides immediate strategic benefits:
• Eliminates misdirected type-in traffic and email security leakage.
• Significantly improves organic trust and ad conversion efficiency.
• Signals definitive category leadership to prospective customers and enterprise partners.

We have set a straightforward direct-acquisition price of ${binFormatted}, and can also offer flexible lease-to-own financing starting at ${monthlyFormatted}/month over 24 months with zero upfront interest via Dan / Escrow.com.

Would your team be open to exploring an acquisition before we open discussions with other players in the ${vertical.label} sector?

Best regards,

[Your Name / Domain Representative]
[Your Contact Information]`,
        },
        {
            id: 'corporate-ma',
            name: 'The Enterprise M&A / Category Moat Pitch',
            bestFor: 'Reaching out to Heads of Corporate Development, VP of Strategy, or General Counsel at mid-market & enterprise firms.',
            subjectLine: `Strategic acquisition notice: ${domain} in the ${vertical.label} market`,
            bodyText: `Dear [Executive Name / Corp Dev Team],

I am contacting your team regarding the strategic digital asset ${domain}.

Given your prominent market footprint in ${vertical.label}, this asset represents a rare opportunity to secure a premier exact-match brand before it transitions to an active market competitor or new market entrant.

Key Due Diligence Highlights for ${domain}:
• Exact clean term: "${label}"
• Clean trademark clearance and high organic memorability
• Target Acquisition Valuation: ${binFormatted}

We are preparing an exclusive buyer outreach cycle and wanted to provide your corporate development team with right-of-first-look consideration.

If your leadership would be interested in securing this asset via standard Escrow.com corporate settlement, please let me know who on your team is best positioned to review this brief.

Sincerely,

[Your Name / Digital Asset Broker]
[Your Contact Information]`,
        },
        {
            id: 'lease-to-own',
            name: 'The Lease-To-Own Startup Financing Pitch',
            bestFor: 'Reaching high-growth, venture-backed founders who want to preserve immediate working capital while locking in brand equity.',
            subjectLine: `${domain} — Zero-cash-outlay lease-to-own structure`,
            bodyText: `Hi [Founder Name],

Great domain names usually require significant upfront capital—unless you structure them like modern equipment leases.

I represent ${domain}. Rather than requiring a full one-time purchase, we can transfer active DNS control to your company immediately on a monthly payment model:

• Monthly installment: ${monthlyFormatted}/month (24-month term)
• Zero upfront equity or credit underwriting required
• Immediate live DNS delegation to host your application / website today
• Complete legal title transfers to your company upon completion of payments

You get the prestige, security, and recall of ${domain} immediately, with payments funded out of standard operating cash flow.

If this aligns with your growth roadmap for this quarter, let me know and I will send over the Dan.com secure checkout link.

Warm regards,

[Your Name]
[Your Contact Information]`,
        },
    ];

    const outboundAngle = compositionQuality === 'strong'
        ? `Lead with category dominance: "${domain}" is an authoritative exact match. Emphasize that acquiring it permanently denies competitors the chance to leverage the name.`
        : `Lead with practical utility: "${domain}" removes branding friction. Emphasize the monthly financing structure (${monthlyFormatted}/mo) to eliminate budget objections.`;

    const recommendedOutreachChannel: LeadProspectorResult['recommendedOutreachChannel'] =
        vertical.heat === 'high'
            ? 'Corporate M&A / VP BizDev Email'
            : isCom
              ? 'LinkedIn InMail + Direct Founder Email'
              : 'Wholesale Broker Network';

    return {
        buyerProfiles,
        pitchTemplates,
        outboundAngle,
        recommendedOutreachChannel,
    };
}
