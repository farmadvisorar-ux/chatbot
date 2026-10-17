export interface SeoEquityResult {
    equityTier: 'Elite Brand Authority' | 'Established Digital Asset' | 'Commercial Brand Equity' | 'Emerging Clean Slate';
    authorityScore: number; // 0-100
    brandSearchability: number; // 0-100
    radioTestScore: number; // 0-100
    indexabilityStatus: 'Optimal' | 'Standard' | 'Caution';
    summary: string;
    details: string;
}

export function computeSeoEquity(params: {
    domain: string;
    tld: string;
    charCount: number;
    wordCount: number;
    isSingleWord: boolean;
    linguisticScore: number;
    tldAuthority: number;
    archiveAgeYears: number | null;
    hasSnapshots: boolean;
    hasTrademarkCollision: boolean;
}): SeoEquityResult {
    const {
        tld,
        charCount,
        wordCount,
        isSingleWord,
        linguisticScore,
        tldAuthority,
        archiveAgeYears,
        hasSnapshots,
        hasTrademarkCollision,
    } = params;

    const isCom = tld === 'com';
    const ageBonus = archiveAgeYears ? Math.min(25, archiveAgeYears * 1.2) : 0;

    // Authority composite: TLD strength + linguistic recall + age vintage
    let rawAuthority = (tldAuthority * 0.45) + (linguisticScore * 0.35) + ageBonus;
    if (isSingleWord && isCom) rawAuthority += 15;
    if (wordCount === 2 && isCom) rawAuthority += 8;
    if (hasTrademarkCollision) rawAuthority = Math.max(10, rawAuthority - 35);

    const authorityScore = Math.max(15, Math.min(99, Math.round(rawAuthority)));

    // Radio test & searchability: short, dictionary, pronounceable names are effortless to find organically
    let searchability = linguisticScore;
    if (charCount <= 8) searchability += 10;
    if (isCom) searchability += 10;
    searchability = Math.max(20, Math.min(98, Math.round(searchability)));

    let radioTest = Math.round(linguisticScore * 0.9 + (isSingleWord ? 10 : 0));
    radioTest = Math.max(25, Math.min(99, radioTest));

    let equityTier: SeoEquityResult['equityTier'] = 'Emerging Clean Slate';
    if (authorityScore >= 85) equityTier = 'Elite Brand Authority';
    else if (authorityScore >= 70) equityTier = 'Established Digital Asset';
    else if (authorityScore >= 50) equityTier = 'Commercial Brand Equity';

    let indexabilityStatus: SeoEquityResult['indexabilityStatus'] = 'Optimal';
    let summary = 'High organic search potential with clean brand recognition.';
    let details = 'Strong baseline foundation for search engine indexing, memorability, and direct navigation traffic.';

    if (hasTrademarkCollision) {
        indexabilityStatus = 'Caution';
        summary = 'Search collision / trademark interference detected.';
        details = 'Search results will likely be dominated by the preexisting trademark holder, creating extreme SEO friction.';
    } else if (hasSnapshots && archiveAgeYears && archiveAgeYears >= 10) {
        summary = `Exceptional vintage authority (~${archiveAgeYears.toFixed(0)} years of historical indexing).`;
        details = 'Aged web footprint signals domain trust to search engine algorithms and reduces sandbox lag upon site deployment.';
    } else if (!hasSnapshots) {
        summary = 'Uncontested clean slate ready for fresh organic brand building.';
        details = 'Zero prior crawl history eliminates historical spam penalties or stale backlink baggage.';
    }

    return {
        equityTier,
        authorityScore,
        brandSearchability: searchability,
        radioTestScore: radioTest,
        indexabilityStatus,
        summary,
        details,
    };
}
