import { extractTld, normalizeDomain, rootLabel, isValidDomain } from '../domain';
import { getTldInfo } from './tld-table';
import { bestKeywordMatch } from './keywords';
import { segmentLabel, isDictionaryWord } from './dictionary';
import { scoreBrandability, scoreLength } from './linguistics';
import { scorePhoneticClarity, type PhoneticResult } from './phonetics';
import { findComps, type MatchedComp } from './comps';
import { lookupDomainAge, type RdapResult } from './rdap';
import { baselineValueUsd } from './pricing-curve';
import { getVerticalInfo, type VerticalInfo } from './verticals';
import { computeChannelPricing, computeOutboundFitScore, type ChannelPricing } from './channel-pricing';
import { checkTrademarkRisk, screenTrademarkAndUdrp, type TrademarkResult } from './trademark';

import { generateGtmStrategy, type GtmStrategy } from './gtm';
import { lookupArchiveHistory, type ArchiveHistoryResult } from './archive';
import { computeSeoEquity, type SeoEquityResult } from './seo-equity';
import { checkAlternativeTlds, type AlternativeTldsResult } from './alternative-tlds';
import { generateLeadProspector, type LeadProspectorResult } from './prospector';
import { classifyStructuralArchetype, type StructuralArchetypeInfo } from './structural-classifier';
import { computeEconomicArbitrage, type EconomicArbitrageResult } from './economic-arbitrage';
import { getPool } from '../db';
import { COMPS } from '@/data/comps-seed';

export type { StructuralArchetypeInfo };
export type { EconomicArbitrageResult };

export type Confidence = 'low' | 'medium' | 'high';

export interface ConfidenceFactor {
    name: string;
    score: number; // 0-100
    weight: number; // fraction of overall confidence (sums to 1.0)
    impact: 'positive' | 'neutral' | 'negative';
    description: string;
}

export type LiquidityRating = 'Ultra-Liquid' | 'High Liquidity' | 'Moderate Liquidity' | 'Niche / Illiquid';

export interface LiquidityProfile {
    rating: LiquidityRating;
    score: number; // 0-100
    estimatedDaysToSell: string;
    turnoverVelocity: 'fast' | 'moderate' | 'slow';
    rationale: string;
}

export interface FactorBreakdown {
    key: string;
    label: string;
    score: number; // 0-100
    weight: number; // fraction of the linguistic composite
    detail: string;
}

export interface ValuationLedgerItem {
    label: string;
    amountUsd: number;
    impact: 'credit' | 'debit' | 'baseline';
    category: 'scarcity' | 'linguistics' | 'commercial' | 'traffic' | 'provenance' | 'defensive' | 'risk';
    description: string;
}

export interface TriangulationResult {
    structuralValueUsd: number;
    compsValueUsd: number | null;
    economicValueUsd: number;
    defensiveValueUsd: number;
    consensusFmvUsd: number;
    modelAgreementScore: number; // 0-100% convergence
    modelWeights: {
        structural: number;
        comps: number;
        economic: number;
    };
}

export interface ValuationResult {
    domain: string;
    tld: string;
    rootLabel: string;
    charCount: number;
    words: string[];
    linguisticScore: number;
    factors: FactorBreakdown[];
    tld_authority: number;
    tld_multiplier: number;
    tld_label: string;
    keyword: { keyword: string; tier: string; multiplier: number; category: string } | null;
    vertical: VerticalInfo;
    age: RdapResult | null;
    exactComp: MatchedComp | null;
    comps: MatchedComp[];
    compsWeight: number;
    lowUsd: number;
    midUsd: number;
    highUsd: number;
    confidence: Confidence;
    confidenceScore: number; // 0-100 quantitative trust rating
    confidenceFactors: ConfidenceFactor[];
    liquidity: LiquidityProfile;
    volatilityBandPercent: number; // e.g. 28% for tight bands, 70% for wide
    channelPricing: ChannelPricing;
    outboundFitScore: number;
    trademark: TrademarkResult;
    archive: ArchiveHistoryResult | null;
    seoEquity: SeoEquityResult;
    alternativeTlds: AlternativeTldsResult;
    leadProspector: LeadProspectorResult;
    gtm: GtmStrategy;
    // --- Groundbreaking Engine v3.0 Extensions ---
    structuralArchetype: StructuralArchetypeInfo;
    economicArbitrage: EconomicArbitrageResult;
    triangulation: TriangulationResult;
    valuationLedger: ValuationLedgerItem[];
    generatedAt: string;
}

/**
 * DomainIQ Consensus Valuation Engine v3.0 (CVM-4)
 * A world-class quad-model institutional triangulation engine that synthesizes:
 * 1. Structural Scarcity & Asset Class Archetype Floor
 * 2. Time-Decayed KNN Comps Regression (Present-Value Normalized)
 * 3. Capitalized Search Arbitrage & CAC Economic Engine
 * 4. Enterprise Defensive Collision Leverage
 */
export async function evaluateDomain(
    input: string,
    opts: { lookupAge?: boolean; lookupArchive?: boolean; checkTrademark?: boolean } = {},
): Promise<ValuationResult> {
    const domain = normalizeDomain(input);
    if (!isValidDomain(domain)) {
        throw new Error(`"${input}" is not a valid domain name`);
    }

    const tld = extractTld(domain);
    const label = rootLabel(domain);
    const charCount = label.length;

    // 1. Structural Asset Archetype Analysis (Model 1 Baseline)
    const structuralArchetype = classifyStructuralArchetype(label, tld);

    // 2. Lexical & Linguistic Analysis
    const segmentation = segmentLabel(label);
    const isSingleWord = segmentation.words.length === 1 && isDictionaryWord(label);
    const isTwoWord = segmentation.words.length === 2 && segmentation.coverage === 1;

    let wordCountTag = 0;
    let compositionScore: number;
    let compositionDetail: string;
    if (isSingleWord) {
        wordCountTag = 1;
        compositionScore = 100;
        compositionDetail = `"${label}" is a single, complete dictionary word — peak lexical scarcity and instant brand recall.`;
    } else if (isTwoWord) {
        wordCountTag = 2;
        compositionScore = 88;
        compositionDetail = `Reads as two real dictionary words (${segmentation.words.join(' + ')}) — intuitive commercial phrasing.`;
    } else if (segmentation.coverage >= 0.6) {
        wordCountTag = segmentation.words.filter(isDictionaryWord).length;
        compositionScore = Math.round(30 + segmentation.coverage * 55);
        compositionDetail = `Recognizable dictionary roots (${segmentation.words.join(' + ')}), ${Math.round(segmentation.coverage * 100)}% lexical coverage.`;
    } else {
        compositionScore = Math.round(20 + segmentation.coverage * 40);
        compositionDetail = 'No standard dictionary match — evaluated primarily on phonetic fluency, syllabic rhythm, and coined brandability.';
    }

    const brandability = scoreBrandability(label);
    const phonetic: PhoneticResult = scorePhoneticClarity(label);
    const lengthScoreInfo = scoreLength(charCount);
    const tldInfo = getTldInfo(tld);
    const keywordMatch = bestKeywordMatch(label);
    const vertical = getVerticalInfo(keywordMatch?.category ?? null);

    const factors: FactorBreakdown[] = [
        { key: 'length', label: 'Length & Conciseness', score: lengthScoreInfo.score, weight: 0.30, detail: `${charCount} characters. ${lengthScoreInfo.note}.` },
        { key: 'composition', label: 'Word Composition & Structure', score: compositionScore, weight: 0.35, detail: compositionDetail },
        { key: 'brandability', label: 'Brandability & Memorability', score: brandability.score, weight: 0.20, detail: brandability.notes.join(' ') || 'Pronounceable, memorable, and visually balanced.' },
        { key: 'phonetic', label: 'Phonetic Clarity ("Radio Test")', score: phonetic.score, weight: 0.15, detail: phonetic.notes.join(' ') || 'Clean pronunciation with zero spoken-vs-written ambiguity.' },
    ];

    const linguisticScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    const linguisticBase = baselineValueUsd(linguisticScore);
    const keywordMultiplier = keywordMatch?.multiplier ?? 1.0;

    // 3. Parallel Due Diligence Lookups (RDAP Age, Archive Wayback, Trademark Screening, Alternative TLDs)
    const agePromise = opts.lookupAge ? lookupDomainAge(domain, 1200).catch(() => null) : Promise.resolve(null);
    const trademarkPromise = opts.checkTrademark === false
        ? Promise.resolve({
            checked: false,
            source: 'heuristic-only' as const,
            riskLevel: 'unknown' as const,
            udrpRiskScore: 0,
            udrpRating: 'Minimal Risk' as const,
            matches: [],
            links: {
                usptoUrl: `https://tmsearch.uspto.gov/search/search-results?query=${encodeURIComponent(label)}`,
                wipoUrl: `https://www.wipo.int/amc/en/domains/search/index.jsp?q=${encodeURIComponent(label)}`,
                euipoUrl: `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/${encodeURIComponent(label)}`,
            },
            disclaimer: 'Trademark screening skipped for this request.',
        })
        : checkTrademarkRisk(label, 1000).catch(() => screenTrademarkAndUdrp(label));

    const archivePromise = (opts.lookupArchive !== false && opts.lookupAge !== false)
        ? lookupArchiveHistory(domain, null, 1200).catch(() => null)
        : Promise.resolve(null);

    const preliminaryStructural = Math.max(
        structuralArchetype.marketFloorUsd,
        Math.round(linguisticBase * tldInfo.multiplier * keywordMultiplier * Math.min(structuralArchetype.structuralMultiplier, 4.0)),
    );

    const alternativeTldsPromise = checkAlternativeTlds({
        label,
        currentTld: tld,
        baseLinguisticUsd: linguisticBase,
        keywordMultiplier,
        effectiveAgeYears: 0,
        currentMidUsd: preliminaryStructural,
        skipDns: opts.lookupAge === false,
    }).catch(() => ({
        alternatives: [],
        checkedCount: 0,
        activeCount: 0,
        collisionDensityScore: 0,
        densityRating: 'Open Brand Landscape' as const,
        strategicRationale: 'Fast estimation mode active.',
    }));

    // 4. Exact Comp Detection (Seed or Database)
    let exactComp: MatchedComp | null = null;
    const seedExact = COMPS.find((c) => c.domain.toLowerCase() === domain.toLowerCase());
    if (seedExact) {
        const parts = seedExact.domain.split('.');
        const l = parts[0] ?? '';
        exactComp = {
            domain: seedExact.domain,
            tld: parts.slice(1).join('.'),
            sale_price_usd: seedExact.salePriceUsd,
            present_value_usd: Math.round(seedExact.salePriceUsd * Math.pow(1.032, Math.max(0, 2026 - seedExact.saleYear))),
            sale_year: seedExact.saleYear,
            word_count: seedExact.wordCount,
            char_count: l.length,
            category: seedExact.category,
            source_note: seedExact.sourceNote,
            similarity: 100,
            matchReason: 'Exact historical domain sale record',
            compTier: 'high-relevance',
        };
    }

    const compsPromise = findComps({
        tld,
        charCount,
        wordCount: wordCountTag,
        category: keywordMatch?.category ?? null,
        referencePriceUsd: preliminaryStructural,
        structuralArchetypeKey: structuralArchetype.key,
        label,
    });

    // Await all parallel pipelines concurrently (never sequential)
    const [age, trademark, rawArchive, alternativeTlds, compsResult] = await Promise.all([
        agePromise,
        trademarkPromise,
        archivePromise,
        alternativeTldsPromise,
        compsPromise,
    ]);

    // Reconcile archive drop-gap against resolved RDAP registration date
    let archive = rawArchive;
    if (archive && archive.hasSnapshots && age?.registrationDate && archive.firstSeenYear) {
        const rdapDate = new Date(age.registrationDate);
        if (!isNaN(rdapDate.getTime())) {
            const rdapRegYear = rdapDate.getFullYear();
            if (rdapRegYear - archive.firstSeenYear >= 3) {
                archive = {
                    ...archive,
                    historicalContinuity: 'drop-risk',
                    riskStatus: 'dormant-gap',
                    summary: `Historical Drop Detected (Archived in ${archive.firstSeenYear}, Re-registered in ${rdapRegYear})`,
                    details: `This domain was initially live and archived in ${archive.firstSeenYear}, but current registration shows ${rdapRegYear}. The domain likely expired or sat dormant before re-acquisition.`,
                };
            }
        }
    }

    const effectiveAgeYears = Math.max(age?.ageYears ?? 0, archive?.archiveAgeYears ?? 0);
    const ageMultiplier = effectiveAgeYears > 0 ? 1 + Math.min(0.45, effectiveAgeYears * 0.022) : 1.0;

    // Model 1: Structural & Linguistic Asset Value
    const rawFormulaPrice = linguisticBase * tldInfo.multiplier * keywordMultiplier * ageMultiplier;
    const structuralValueUsd = Math.max(
        structuralArchetype.marketFloorUsd,
        Math.round(rawFormulaPrice * Math.min(structuralArchetype.structuralMultiplier, 4.0))
    );

    // If exact comp was not in seed and DB is available, check DB quickly
    if (!exactComp && process.env.DATABASE_URL) {
        try {
            const dbQueryPromise = getPool().query<MatchedComp>('SELECT * FROM comps WHERE domain = $1', [domain]);
            const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('db-timeout')), 800));
            const { rows: exactCompRows } = await Promise.race([dbQueryPromise, timer]);
            const exactCompRow = exactCompRows[0];
            if (exactCompRow) {
                exactComp = {
                    ...exactCompRow,
                    present_value_usd: exactCompRow.sale_price_usd,
                    similarity: 100,
                    matchReason: 'Exact historical domain sale record',
                    compTier: 'high-relevance',
                };
            }
        } catch {
            // Safe fallback
        }
    }

    const compsValueUsd = compsResult.impliedPriceUsd;

    // Model 3: Economic CAC Arbitrage & Search Capitalization
    const economicArbitrage = computeEconomicArbitrage({
        label,
        tld,
        category: keywordMatch?.category ?? null,
        isSingleWord,
        compositionScore,
        charCount,
    });
    const economicValueUsd = economicArbitrage.capitalizedAssetValueUsd;

    // If target is .com and sister tech extensions (.ai, .io, .co) are taken, calculate corporate upgrade leverage

    const isCom = tld.toLowerCase() === 'com';
    let defensiveValueUsd = 0;
    if (isCom && alternativeTlds.activeCount >= 1) {
        // Companies on alternative TLDs create high acquisition pressure for the .com
        const collisionScale = Math.min(2.5, alternativeTlds.activeCount * 0.45);
        defensiveValueUsd = Math.round(structuralValueUsd * 0.15 * collisionScale);
    }

    // 8. Bayesian Multi-Model Consensus Triangulation Fusion
    let midUsd: number;
    let compsWeight: number;
    let wStructural: number;
    let wComps: number;
    let wEconomic: number;

    if (exactComp) {
        midUsd = exactComp.sale_price_usd;
        compsWeight = 1.0;
        wStructural = 0.0;
        wComps = 1.0;
        wEconomic = 0.0;
    } else {
        if (compsValueUsd !== null && compsResult.weight >= 0.35) {
            wComps = Math.min(0.55, compsResult.weight);
            wStructural = (1.0 - wComps) * 0.70;
            wEconomic = (1.0 - wComps) * 0.30;
        } else if (compsValueUsd !== null && compsResult.weight >= 0.15) {
            wComps = compsResult.weight;
            wStructural = (1.0 - wComps) * 0.72;
            wEconomic = (1.0 - wComps) * 0.28;
        } else {
            wComps = compsValueUsd !== null ? 0.10 : 0.0;
            wStructural = compsValueUsd !== null ? 0.65 : 0.75;
            wEconomic = compsValueUsd !== null ? 0.25 : 0.25;
        }

        const compTarget = compsValueUsd ?? structuralValueUsd;
        let blendedCore = (structuralValueUsd * wStructural) + (compTarget * wComps) + (economicValueUsd * wEconomic);

        // Add defensive corporate collision pressure
        blendedCore += defensiveValueUsd;

        // Apply trademark risk discounts if flagged
        if (trademark.riskLevel === 'severe') {
            blendedCore *= 0.25; // 75% haircut for severe UDRP risk
        } else if (trademark.riskLevel === 'elevated') {
            blendedCore *= 0.70; // 30% haircut for potential trademark friction
        }

        // Clamp to archetype market floor for ultra-liquid tiers
        if (['APEX_1L_COM', 'APEX_2L_COM', 'APEX_3L_COM', 'NUMERIC_2N_COM', 'NUMERIC_3N_COM'].includes(structuralArchetype.key)) {
            midUsd = Math.max(structuralArchetype.marketFloorUsd, Math.round(blendedCore));
        } else {
            midUsd = Math.max(50, Math.round(blendedCore));
        }

        compsWeight = compsResult.weight;
    }

    // 9. Model Agreement & Convergence Index
    let modelAgreementScore = 85;
    if (compsValueUsd !== null) {
        const ratio = Math.max(structuralValueUsd, 1) / Math.max(compsValueUsd, 1);
        const logDiff = Math.abs(Math.log10(ratio));
        modelAgreementScore = Math.max(45, Math.min(99, Math.round(100 - logDiff * 35)));
    }

    const triangulation: TriangulationResult = {
        structuralValueUsd,
        compsValueUsd,
        economicValueUsd,
        defensiveValueUsd,
        consensusFmvUsd: midUsd,
        modelAgreementScore,
        modelWeights: {
            structural: Number(wStructural.toFixed(2)),
            comps: Number(wComps.toFixed(2)),
            economic: Number(wEconomic.toFixed(2)),
        },
    };

    // 10. Itemized Audited Valuation Ledger (XVAL - Explainable Valuation Audit)
    const valuationLedger: ValuationLedgerItem[] = [];

    // Base Archetype
    valuationLedger.push({
        label: `${structuralArchetype.label} Baseline`,
        amountUsd: structuralArchetype.marketFloorUsd,
        impact: 'baseline',
        category: 'scarcity',
        description: `Fundamental market liquidity floor for the ${structuralArchetype.rarity.toLowerCase()} asset class.`,
    });

    // Phonetic & Brandability
    const phoneticDelta = Math.round(midUsd * ((phonetic.score - 70) / 350));
    if (phoneticDelta !== 0) {
        valuationLedger.push({
            label: phoneticDelta > 0 ? 'Phonetic & Radio Test Clarity' : 'Pronunciation & Radio Test Friction',
            amountUsd: Math.abs(phoneticDelta),
            impact: phoneticDelta > 0 ? 'credit' : 'debit',
            category: 'linguistics',
            description: phoneticDelta > 0
                ? 'Flawless verbal clarity with zero spelling ambiguity over phone or podcast audio.'
                : 'Minor phonetic friction requiring clarification during verbal transmission.',
        });
    }

    // Keyword & Industry Demand
    if (keywordMatch && keywordMatch.multiplier > 1.0) {
        const kwPremium = Math.round(midUsd * (1 - 1 / keywordMatch.multiplier));
        valuationLedger.push({
            label: `High-Intent Advertiser Keyword ("${keywordMatch.keyword}")`,
            amountUsd: kwPremium,
            impact: 'credit',
            category: 'commercial',
            description: `Active commercial advertiser bidding in the ${vertical.label} vertical with high customer lifetime value.`,
        });
    }

    // Economic Search & CAC Replacement Equity
    if (economicArbitrage.annualMarketingAvoidanceUsd > 1_000) {
        const trafficEquity = Math.round(Math.min(midUsd * 0.25, economicArbitrage.annualMarketingAvoidanceUsd));
        valuationLedger.push({
            label: 'Organic Search & CAC Replacement Equity',
            amountUsd: trafficEquity,
            impact: 'credit',
            category: 'traffic',
            description: `Replaces an estimated $${economicArbitrage.annualMarketingAvoidanceUsd.toLocaleString()}/yr in recurring paid Google Ads bidding costs.`,
        });
    }

    // Archive History & Provenance
    if (effectiveAgeYears >= 5) {
        const ageCredit = Math.round(midUsd * Math.min(0.20, effectiveAgeYears * 0.012));
        valuationLedger.push({
            label: `Domain Provenance & Archive Age (${effectiveAgeYears.toFixed(0)} Years)`,
            amountUsd: ageCredit,
            impact: 'credit',
            category: 'provenance',
            description: `Longstanding unpenalized digital history conferring search engine domain trust and established authority.`,
        });
    }

    // Defensive Corporate Collision Pressure
    if (defensiveValueUsd > 0) {
        valuationLedger.push({
            label: `Alternative TLD Defensive Upgrade Pressure (${alternativeTlds.activeCount} Active Extensions)`,
            amountUsd: defensiveValueUsd,
            impact: 'credit',
            category: 'defensive',
            description: `Operating businesses on .ai, .io, or .co create strategic motivation to upgrade to this apex .com.`,
        });
    }

    // Trademark Haircut (if any)
    if (trademark.riskLevel === 'severe') {
        const tmDiscount = Math.round(midUsd * 3.0); // was discounted by 75%
        valuationLedger.push({
            label: `Severe Trademark Infringement Exposure ("${trademark.matches[0]?.mark}")`,
            amountUsd: tmDiscount,
            impact: 'debit',
            category: 'risk',
            description: 'Significant legal hazard of UDRP dispute or forfeiture under the Lanham Act.',
        });
    } else if (trademark.riskLevel === 'elevated') {
        const tmDiscount = Math.round(midUsd * 0.42);
        valuationLedger.push({
            label: `Trademark Caution Haircut ("${trademark.matches[0]?.mark}")`,
            amountUsd: tmDiscount,
            impact: 'debit',
            category: 'risk',
            description: 'Partial brand overlap may limit certain commercial end-user monetization avenues.',
        });
    }

    // 11. Confidence & Liquidity Profile
    const { confidence, confidenceScore, confidenceFactors, volatilityBandPercent } = computeConfidence({
        exactComp,
        comps: compsResult.matches,
        compsWeight,
        tldAuthority: tldInfo.authority,
        tld,
        linguisticScore,
        compositionScore,
        keywordMatch,
        archive,
        trademark,
        structuralArchetype,
    });

    const lowUsd = Math.max(50, Math.round(midUsd * (1 - (volatilityBandPercent / 100) * 0.75)));
    const highUsd = Math.round(midUsd * (1 + (volatilityBandPercent / 100) * 1.35));

    const liquidity = computeLiquidity({
        domain,
        tld,
        charCount,
        wordCount: wordCountTag,
        isSingleWord,
        compositionScore,
        tldAuthority: tldInfo.authority,
        trademark,
        archive,
        structuralArchetype,
    });

    const channelPricing = computeChannelPricing({ lowUsd, midUsd: Math.round(midUsd), highUsd, vertical });

    let outboundFitScore = computeOutboundFitScore({
        vertical,
        hasKeywordMatch: Boolean(keywordMatch),
        compositionScore,
        tldAuthority: tldInfo.authority,
    });
    if (trademark.riskLevel === 'severe') {
        outboundFitScore = Math.min(2.0, outboundFitScore * 0.2);
    } else if (trademark.riskLevel === 'elevated') {
        outboundFitScore = Math.min(4.5, outboundFitScore * 0.6);
    }

    const hasTrademarkCollision = trademark.riskLevel === 'elevated' || trademark.riskLevel === 'severe';
    const seoEquity = computeSeoEquity({
        domain,
        tld,
        charCount,
        wordCount: wordCountTag,
        isSingleWord,
        linguisticScore,
        tldAuthority: tldInfo.authority,
        archiveAgeYears: archive?.archiveAgeYears ?? age?.ageYears ?? null,
        hasSnapshots: archive?.hasSnapshots ?? false,
        hasTrademarkCollision,
    });

    const compositionQuality: 'strong' | 'moderate' | 'weak' = compositionScore >= 80 ? 'strong' : compositionScore >= 50 ? 'moderate' : 'weak';
    const gtm = generateGtmStrategy({
        label,
        tld,
        vertical,
        keywordTier: keywordMatch?.tier ?? null,
        compositionQuality,
    });

    const leadProspector = generateLeadProspector({
        domain,
        label,
        tld,
        vertical,
        midUsd: Math.round(midUsd),
        recommendedBin: channelPricing.recommendedBinPrice,
        monthlyLease24: channelPricing.leaseToOwn.months24.monthlyUsd,
        isSingleWord,
        compositionQuality,
    });

    return {
        domain,
        tld,
        rootLabel: label,
        charCount,
        words: segmentation.words,
        linguisticScore: Math.round(linguisticScore),
        factors,
        tld_authority: tldInfo.authority,
        tld_multiplier: tldInfo.multiplier,
        tld_label: tldInfo.label,
        keyword: keywordMatch ? { keyword: keywordMatch.keyword, tier: keywordMatch.tier, multiplier: keywordMatch.multiplier, category: keywordMatch.category } : null,
        vertical,
        age,
        exactComp,
        comps: compsResult.matches,
        compsWeight,
        lowUsd,
        midUsd: Math.round(midUsd),
        highUsd,
        confidence,
        confidenceScore,
        confidenceFactors,
        liquidity,
        volatilityBandPercent,
        channelPricing,
        outboundFitScore,
        trademark,
        archive,
        seoEquity,
        alternativeTlds,
        leadProspector,
        gtm,
        structuralArchetype,
        economicArbitrage,
        triangulation,
        valuationLedger,
        generatedAt: new Date().toISOString(),
    };
}

function computeConfidence(params: {
    exactComp: MatchedComp | null;
    comps: MatchedComp[];
    compsWeight: number;
    tldAuthority: number;
    tld: string;
    linguisticScore: number;
    compositionScore: number;
    keywordMatch: { keyword: string; tier: string; multiplier: number } | null;
    archive: ArchiveHistoryResult | null;
    trademark: TrademarkResult;
    structuralArchetype: StructuralArchetypeInfo;
}): {
    confidence: Confidence;
    confidenceScore: number;
    confidenceFactors: ConfidenceFactor[];
    volatilityBandPercent: number;
} {
    const { exactComp, comps, compsWeight, tldAuthority, tld, linguisticScore, compositionScore, keywordMatch, archive, trademark, structuralArchetype } = params;

    // Factor 1: Comparable Sales Evidence (Weight 30%)
    let compScore = 35;
    let compDesc = 'Limited direct historical sales records for this specific combination; model relies on structural regression.';
    let compImpact: 'positive' | 'neutral' | 'negative' = 'negative';

    if (exactComp) {
        compScore = 100;
        compDesc = `Verified historical recorded sale of this exact domain (${exactComp.domain}).`;
        compImpact = 'positive';
    } else if (comps.length > 0) {
        const topComp = comps[0];
        const topSimilarity = topComp?.similarity ?? 0;
        if (topSimilarity >= 80 && compsWeight >= 0.35 && topComp) {
            compScore = Math.min(96, Math.round(topSimilarity * 0.95 + comps.length * 2));
            compDesc = `Strong comparable sales evidence: ${comps.length} close market benchmarks (top comp: ${topComp.domain} at ${topSimilarity}% match).`;
            compImpact = 'positive';
        } else if (topSimilarity >= 60 || compsWeight >= 0.2) {
            compScore = Math.min(82, Math.round(55 + topSimilarity * 0.3));
            compDesc = `Solid comparable support: ${comps.length} market sales with similar profile and present-value calibration.`;
            compImpact = 'neutral';
        } else {
            compScore = Math.max(45, Math.round(topSimilarity * 0.7));
            compDesc = `Directional comps available across similar character profiles.`;
            compImpact = 'neutral';
        }
    }

    // Factor 2: Extension Stability & Scarcity (Weight 20%)
    let tldScore = Math.round(tldAuthority);
    let tldDesc = `.${tld} has established secondary market liquidity and institutional recognition.`;
    let tldImpact: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (tld === 'com') {
        tldScore = 98;
        tldDesc = '.com represents universal global standard and maximum commercial buyer liquidity.';
        tldImpact = 'positive';
    } else if (['ai', 'io', 'org', 'net', 'co'].includes(tld)) {
        tldScore = Math.max(80, tldAuthority);
        tldDesc = `.${tld} is a liquid premium tier extension with established tech/institutional aftermarket.`;
        tldImpact = 'positive';
    } else if (tldAuthority < 50) {
        tldScore = Math.min(55, Math.max(25, tldAuthority));
        tldDesc = `.${tld} experiences lower aftermarket transaction volume; price discovery is wider.`;
        tldImpact = 'negative';
    }

    // Factor 3: Lexical & Phonetic Determinism (Weight 20%)
    const lexScore = Math.min(100, Math.max(20, Math.round(compositionScore * 0.6 + linguisticScore * 0.4)));
    let lexDesc = 'Clean dictionary-aligned spelling eliminates cognitive load and anchors value.';
    let lexImpact: 'positive' | 'neutral' | 'negative' = 'positive';
    if (lexScore >= 80 || structuralArchetype.rarity === 'Extreme Scarcity') {
        lexDesc = 'High clarity: standard vocabulary or rare structural archetype with zero radio-test ambiguity.';
        lexImpact = 'positive';
    } else if (lexScore >= 55) {
        lexDesc = 'Moderate lexical clarity: recognizable pattern, though partly reliant on brand positioning.';
        lexImpact = 'neutral';
    } else {
        lexDesc = 'Unconventional spelling, length, or invented construction creates wider variance in buyer valuation.';
        lexImpact = 'negative';
    }

    // Factor 4: Commercial Demand & Advertiser Intent (Weight 15%)
    let comScore = 50;
    let comDesc = 'General commercial interest with balanced brandable utility.';
    let comImpact: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (keywordMatch) {
        if (keywordMatch.tier === 'S' || keywordMatch.tier === '1') {
            comScore = 96;
            comDesc = `High-intent commercial keyword ("${keywordMatch.keyword}") with intensive advertiser bidding and high customer LTV.`;
            comImpact = 'positive';
        } else if (keywordMatch.tier === 'A' || keywordMatch.tier === '2') {
            comScore = 82;
            comDesc = `Established industry keyword ("${keywordMatch.keyword}") with strong commercial utility.`;
            comImpact = 'positive';
        } else {
            comScore = 68;
            comDesc = `Recognized commercial keyword ("${keywordMatch.keyword}").`;
            comImpact = 'neutral';
        }
    } else if (compositionScore >= 85 && tld === 'com') {
        comScore = 80;
        comDesc = 'Category-defining dictionary word commanding universal commercial utility.';
        comImpact = 'positive';
    }

    // Factor 5: Historical Due Diligence & Legal Cleanliness (Weight 15%)
    let ddScore = 75;
    let ddDesc = 'Clean legal screening with no recorded brand collisions or UDRP red flags.';
    let ddImpact: 'positive' | 'neutral' | 'negative' = 'positive';

    if (trademark.riskLevel === 'severe') {
        ddScore = 15;
        ddDesc = `Severe trademark conflict: "${trademark.matches[0]?.mark}". High risk of UDRP dispute or forfeiture.`;
        ddImpact = 'negative';
    } else if (trademark.riskLevel === 'elevated') {
        ddScore = 45;
        ddDesc = `Trademark caution: overlaps with registered brand "${trademark.matches[0]?.mark}". Legal friction risk.`;
        ddImpact = 'negative';
    } else if (archive?.historicalContinuity === 'longstanding') {
        ddScore = 95;
        ddDesc = `Verified ${archive.archiveAgeYears?.toFixed(0)}+ year continuous web archive footprint with clean standing.`;
        ddImpact = 'positive';
    } else if (archive?.historicalContinuity === 'virgin') {
        ddScore = 82;
        ddDesc = 'Virgin unindexed asset: clean slate with zero legacy spam, penalties, or PBN footprint.';
        ddImpact = 'positive';
    } else if (archive?.historicalContinuity === 'drop-risk') {
        ddScore = 62;
        ddDesc = `Historical registration gap: live in ${archive.firstSeenYear}, current cycle re-registered.`;
        ddImpact = 'neutral';
    }

    const confidenceFactors: ConfidenceFactor[] = [
        { name: 'Comparable Sales Evidence', score: compScore, weight: 0.30, impact: compImpact, description: compDesc },
        { name: 'Extension Authority & Liquidity', score: tldScore, weight: 0.20, impact: tldImpact, description: tldDesc },
        { name: 'Lexical Clarity & Phonetics', score: lexScore, weight: 0.20, impact: lexImpact, description: lexDesc },
        { name: 'Commercial Search & Industry Demand', score: comScore, weight: 0.15, impact: comImpact, description: comDesc },
        { name: 'Historical & Legal Due Diligence', score: ddScore, weight: 0.15, impact: ddImpact, description: ddDesc },
    ];

    const rawScore = confidenceFactors.reduce((sum, f) => sum + f.score * f.weight, 0);
    let confidenceScore = Math.max(15, Math.min(99, Math.round(rawScore)));

    let confidence: Confidence = 'low';
    let volatilityBandPercent = 65;

    if (trademark.riskLevel === 'severe') {
        confidence = 'low';
        confidenceScore = Math.min(35, confidenceScore);
        volatilityBandPercent = 85;
    } else if (confidenceScore >= 75 || exactComp || ['APEX_1L_COM', 'APEX_2L_COM', 'APEX_3L_COM'].includes(structuralArchetype.key)) {
        confidence = 'high';
        volatilityBandPercent = 25;
    } else if (confidenceScore >= 50) {
        confidence = 'medium';
        volatilityBandPercent = 45;
    }

    return { confidence, confidenceScore, confidenceFactors, volatilityBandPercent };
}

function computeLiquidity(params: {
    domain: string;
    tld: string;
    charCount: number;
    wordCount: number;
    isSingleWord: boolean;
    compositionScore: number;
    tldAuthority: number;
    trademark?: TrademarkResult;
    archive?: ArchiveHistoryResult | null;
    structuralArchetype: StructuralArchetypeInfo;
}): LiquidityProfile {
    const { domain, tld, charCount, wordCount, isSingleWord, compositionScore, tldAuthority, trademark, structuralArchetype } = params;

    if (trademark && trademark.riskLevel === 'severe') {
        return {
            rating: 'Niche / Illiquid',
            score: 15,
            estimatedDaysToSell: 'Not Recommended',
            turnoverVelocity: 'slow',
            rationale: `Active trademark conflict against "${trademark.matches[0]?.mark}" presents critical UDRP forfeiture risk, preventing open commercial liquidity.`,
        };
    }

    // Rare structural archetypes (1L, 2L, 3L, 2N, 3N) have guaranteed ultra-liquidity
    if (['APEX_1L_COM', 'APEX_2L_COM', 'APEX_3L_COM', 'NUMERIC_2N_COM', 'NUMERIC_3N_COM'].includes(structuralArchetype.key)) {
        return {
            rating: 'Ultra-Liquid',
            score: 98,
            estimatedDaysToSell: '7 - 30 days',
            turnoverVelocity: 'fast',
            rationale: `${structuralArchetype.label} represents a globally recognized sovereign asset class with guaranteed floor pricing and instant cash liquidity in wholesale auctions.`,
        };
    }

    const isCom = tld.toLowerCase() === 'com';
    const isTechLiquid = ['ai', 'io'].includes(tld.toLowerCase());
    const label = domain.split('.')[0] ?? '';
    const hasHyphenOrNumbers = /[-0-9]/.test(label);

    const is4LCom = isCom && charCount === 4 && !hasHyphenOrNumbers;
    const isSingleWordCom = isCom && isSingleWord;

    if (isSingleWordCom && compositionScore >= 90) {
        return {
            rating: 'Ultra-Liquid',
            score: 95,
            estimatedDaysToSell: '14 - 45 days',
            turnoverVelocity: 'fast',
            rationale: 'Top-tier dictionary .com words have constant inbound buyer demand and liquidate rapidly through wholesale dealer networks.',
        };
    }

    if (is4LCom || (isTechLiquid && isSingleWord) || (isCom && wordCount === 2 && compositionScore >= 80)) {
        return {
            rating: 'High Liquidity',
            score: 82,
            estimatedDaysToSell: '30 - 90 days',
            turnoverVelocity: 'fast',
            rationale: is4LCom
                ? '4-letter .com domains maintain active daily liquidity in wholesale auctions and investor forums.'
                : isTechLiquid
                ? `Single-word .${tld} assets have high turnover among funded startups and tech incubators.`
                : 'Clean two-word .coms with clear commercial meaning attract steady inbound offers and wholesale bids.',
        };
    }

    if (isCom || isTechLiquid || (tldAuthority >= 65 && wordCount <= 2)) {
        if (!hasHyphenOrNumbers && charCount <= 14) {
            return {
                rating: 'Moderate Liquidity',
                score: 58,
                estimatedDaysToSell: '3 - 12 months',
                turnoverVelocity: 'moderate',
                rationale: 'Solid commercial potential with regular aftermarket inquiries; typical hold period for a fair-market end-user sale.',
            };
        }
    }

    return {
        rating: 'Niche / Illiquid',
        score: 32,
        estimatedDaysToSell: '1 - 3+ years',
        turnoverVelocity: 'slow',
        rationale: hasHyphenOrNumbers
            ? 'Hyphens or digits significantly reduce secondary market liquidity and require patient buyer discovery.'
            : 'Longer phrasing or alternative TLD extensions typically trade through specialized outbound outreach rather than organic inbound velocity.',
    };
}

export async function recordValuation(result: ValuationResult): Promise<void> {
    try {
        await getPool().query(
            `INSERT INTO valuations (domain, score, low_usd, mid_usd, high_usd, confidence, breakdown_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [result.domain, result.linguisticScore, result.lowUsd, result.midUsd, result.highUsd, result.confidence, JSON.stringify(result)],
        );
    } catch {
        // Safe in-memory/offline execution
    }
}
