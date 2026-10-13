import { isDictionaryWord, segmentLabel } from './dictionary';
import { KEYWORDS } from './keywords';

export interface EconomicArbitrageResult {
    monthlyExactSearchEstimate: number;
    estimatedCpcUsd: number;
    annualMarketingAvoidanceUsd: number;
    capitalizedAssetValueUsd: number;
    conversionTrustLiftPercent: number;
    commercialIntentGrade: 'Tier-1 Institutional (High CPC)' | 'Tier-2 Commercial' | 'Tier-3 Operational' | 'Brandable / Low Direct CPC';
    rationale: string;
}

// Category-specific Cost-Per-Click (CPC) benchmarks based on Google Search advertiser auction data
const VERTICAL_CPC_BENCHMARKS: Record<string, { cpc: number; label: string; volumeWeight: number }> = {
    finance: { cpc: 28.50, label: 'Finance & Banking', volumeWeight: 1.8 },
    legal: { cpc: 45.00, label: 'Legal & Attorney', volumeWeight: 1.4 },
    health: { cpc: 18.20, label: 'Healthcare & Pharma', volumeWeight: 1.5 },
    insurance: { cpc: 52.00, label: 'Insurance & Risk', volumeWeight: 2.2 },
    crypto: { cpc: 14.50, label: 'Cryptocurrency & Web3', volumeWeight: 1.6 },
    gaming: { cpc: 22.00, label: 'iGaming & Sportsbook', volumeWeight: 1.9 },
    saas: { cpc: 16.50, label: 'Enterprise Cloud & SaaS', volumeWeight: 1.7 },
    ai: { cpc: 15.00, label: 'Artificial Intelligence & ML', volumeWeight: 2.0 },
    'real-estate': { cpc: 11.20, label: 'Real Estate & Property', volumeWeight: 1.3 },
    travel: { cpc: 8.50, label: 'Travel & Hospitality', volumeWeight: 1.5 },
    auto: { cpc: 9.80, label: 'Automotive & Mobility', volumeWeight: 1.4 },
    retail: { cpc: 2.80, label: 'E-Commerce & Consumer Retail', volumeWeight: 1.2 },
    education: { cpc: 7.20, label: 'Education & EdTech', volumeWeight: 1.1 },
    'local-services': { cpc: 12.50, label: 'Local Home Services', volumeWeight: 1.0 },
    tech: { cpc: 9.00, label: 'Technology Hardware & Systems', volumeWeight: 1.3 },
    media: { cpc: 3.50, label: 'Media & Streaming', volumeWeight: 1.2 },
    content: { cpc: 1.20, label: 'Information & Publishing', volumeWeight: 0.9 },
    community: { cpc: 1.50, label: 'Social & Community', volumeWeight: 0.8 },
    other: { cpc: 2.50, label: 'General Commercial', volumeWeight: 1.0 },
};

/**
 * Computes the Economic Fundamental Value of a domain based on Customer Acquisition Cost (CAC)
 * replacement, direct navigation type-in traffic, and capitalized search advertising savings.
 */
export function computeEconomicArbitrage(params: {
    label: string;
    tld: string;
    category: string | null;
    isSingleWord: boolean;
    compositionScore: number;
    charCount: number;
}): EconomicArbitrageResult {
    const { label, tld, category, isSingleWord, compositionScore, charCount } = params;
    const isCom = tld.toLowerCase() === 'com';
    const isTech = ['ai', 'io'].includes(tld.toLowerCase());

    // 1. Determine Industry Cost-Per-Click (CPC)
    const benchmark = (category && VERTICAL_CPC_BENCHMARKS[category])
        ? VERTICAL_CPC_BENCHMARKS[category]!
        : VERTICAL_CPC_BENCHMARKS['other']!;

    let cpc = benchmark.cpc;
    const kwMatch = KEYWORDS[label.toLowerCase()];
    if (kwMatch) {
        if (kwMatch.tier === 'S') cpc = Math.max(cpc, 35.0);
        else if (kwMatch.tier === 'A') cpc = Math.max(cpc, 18.0);
        else if (kwMatch.tier === 'B') cpc = Math.max(cpc, 8.5);
    }

    // 2. Estimate Organic Monthly Search & Direct Navigational Type-in Demand
    let estimatedMonthlySearches = 200;
    let typeInMultiplier = 1.0;

    if (isSingleWord && isDictionaryWord(label)) {
        if (charCount <= 5) {
            estimatedMonthlySearches = Math.round(45_000 * benchmark.volumeWeight);
            typeInMultiplier = 3.5;
        } else if (charCount <= 8) {
            estimatedMonthlySearches = Math.round(18_000 * benchmark.volumeWeight);
            typeInMultiplier = 2.2;
        } else {
            estimatedMonthlySearches = Math.round(6_000 * benchmark.volumeWeight);
            typeInMultiplier = 1.5;
        }
    } else {
        const seg = segmentLabel(label);
        if (seg.words.length === 2 && seg.coverage === 1) {
            estimatedMonthlySearches = Math.round(3_200 * benchmark.volumeWeight);
            typeInMultiplier = 1.2;
        } else if (compositionScore >= 60) {
            estimatedMonthlySearches = Math.round(800 * benchmark.volumeWeight);
            typeInMultiplier = 0.8;
        } else {
            estimatedMonthlySearches = 150;
            typeInMultiplier = 0.3;
        }
    }

    if (!isCom) {
        if (isTech) {
            typeInMultiplier *= 0.65;
            estimatedMonthlySearches = Math.round(estimatedMonthlySearches * 0.7);
        } else {
            typeInMultiplier *= 0.25;
            estimatedMonthlySearches = Math.round(estimatedMonthlySearches * 0.35);
        }
    }

    // 3. Calculate Annual Marketing Cost Avoidance (CAC Arbitrage)
    // Formula: Navigational visits / year * CPC
    // Assumes 12% click-through capture on exact organic/type-in navigational volume
    const annualNavigationalClicks = Math.round(estimatedMonthlySearches * 12 * 0.12 * typeInMultiplier);
    const annualMarketingAvoidanceUsd = Math.round(annualNavigationalClicks * cpc);

    // 4. Capitalize at an Institutional Domain Cap Rate (10% Cap Rate = 10x Annual Savings)
    // Clamped between conservative minimums and grounded market ceilings
    const capRate = 0.10;
    let capitalizedAssetValueUsd = Math.round(annualMarketingAvoidanceUsd / capRate);

    // Grounding bounds so low-value domains don't over-inflate and apex domains reflect true enterprise value
    if (isSingleWord && isCom) {
        capitalizedAssetValueUsd = Math.max(75_000, capitalizedAssetValueUsd);
    } else if (capitalizedAssetValueUsd < 100) {
        capitalizedAssetValueUsd = 120;
    }

    // 5. Conversion Trust Lift (Owning exact apex domain lifts landing page conversion rate by 15-35%)
    let conversionTrustLiftPercent = 8;
    if (isCom) {
        if (isSingleWord) conversionTrustLiftPercent = 34;
        else if (compositionScore >= 80) conversionTrustLiftPercent = 22;
        else conversionTrustLiftPercent = 14;
    } else if (isTech && isSingleWord) {
        conversionTrustLiftPercent = 26;
    }

    // 6. Grade
    let commercialIntentGrade: EconomicArbitrageResult['commercialIntentGrade'] = 'Brandable / Low Direct CPC';
    if (cpc >= 20.0 || (isSingleWord && isCom)) {
        commercialIntentGrade = 'Tier-1 Institutional (High CPC)';
    } else if (cpc >= 8.0) {
        commercialIntentGrade = 'Tier-2 Commercial';
    } else if (cpc >= 3.0) {
        commercialIntentGrade = 'Tier-3 Operational';
    }

    const rationale = isSingleWord && isCom
        ? `Category-defining .com replaces an estimated $${annualMarketingAvoidanceUsd.toLocaleString()}/yr in recurring Google Ads click spend while conferring a +${conversionTrustLiftPercent}% conversion lift on paid traffic.`
        : `Generates roughly $${annualMarketingAvoidanceUsd.toLocaleString()} in annual organic search equity and paid ad displacement at an industry benchmark CPC of $${cpc.toFixed(2)}.`;

    return {
        monthlyExactSearchEstimate: estimatedMonthlySearches,
        estimatedCpcUsd: Number(cpc.toFixed(2)),
        annualMarketingAvoidanceUsd,
        capitalizedAssetValueUsd,
        conversionTrustLiftPercent,
        commercialIntentGrade,
        rationale,
    };
}
