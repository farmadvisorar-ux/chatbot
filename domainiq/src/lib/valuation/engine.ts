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
import { checkTrademarkRisk, type TrademarkResult } from './trademark';
import { generateGtmStrategy, type GtmStrategy } from './gtm';
import { lookupArchiveHistory, type ArchiveHistoryResult } from './archive';
import { computeSeoEquity, type SeoEquityResult } from './seo-equity';
import { checkAlternativeTlds, type AlternativeTldsResult } from './alternative-tlds';
import { generateLeadProspector, type LeadProspectorResult } from './prospector';
import { getPool } from '../db';
import { COMPS } from '@/data/comps-seed';

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
    generatedAt: string;
}

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

    const segmentation = segmentLabel(label);
    const isSingleWord = segmentation.words.length === 1 && isDictionaryWord(label);
    const isTwoWord = segmentation.words.length === 2 && segmentation.coverage === 1;

    let wordCountTag = 0;
    let compositionScore: number;
    let compositionDetail: string;
    if (isSingleWord) {
        wordCountTag = 1;
        compositionScore = 100;
        compositionDetail = `"${label}" is a single, complete dictionary word — maximum clarity and recall.`;
    } else if (isTwoWord) {
        wordCountTag = 2;
        compositionScore = 88;
        compositionDetail = `Reads as two real words (${segmentation.words.join(' + ')}) — clear and easy to understand.`;
    } else if (segmentation.coverage >= 0.6) {
        wordCountTag = segmentation.words.filter(isDictionaryWord).length;
        compositionScore = Math.round(30 + segmentation.coverage * 55);
        compositionDetail = `Mostly recognizable words (${segmentation.words.join(' + ')}), ${Math.round(segmentation.coverage * 100)}% dictionary coverage.`;
    } else {
        compositionScore = Math.round(20 + segmentation.coverage * 40);
        compositionDetail = 'No strong dictionary-word match — evaluated primarily as a brandable/coined term.';
    }

    const brandability = scoreBrandability(label);
    const phonetic: PhoneticResult = scorePhoneticClarity(label);
    const lengthScoreInfo = scoreLength(charCount);
    const tldInfo = getTldInfo(tld);
    const keywordMatch = bestKeywordMatch(label);
    const vertical = getVerticalInfo(keywordMatch?.category ?? null);

    const factors: FactorBreakdown[] = [
        { key: 'length', label: 'Length', score: lengthScoreInfo.score, weight: 0.3, detail: `${charCount} characters. ${lengthScoreInfo.note}.` },
        { key: 'composition', label: 'Word composition', score: compositionScore, weight: 0.35, detail: compositionDetail },
        { key: 'brandability', label: 'Brandability', score: brandability.score, weight: 0.2, detail: brandability.notes.join(' ') || 'Pronounceable and reasonably memorable.' },
        { key: 'phonetic', label: 'Phonetic clarity ("radio test")', score: phonetic.score, weight: 0.15, detail: phonetic.notes.join(' ') || 'Clean spelling — no obvious spoken-vs-written ambiguity or global-language flags.' },
    ];

    const linguisticScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    const linguisticBase = baselineValueUsd(linguisticScore);

    const keywordMultiplier = keywordMatch?.multiplier ?? 1.0;

    let age: RdapResult | null = null;
    const agePromise = opts.lookupAge ? lookupDomainAge(domain) : Promise.resolve(null);
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
        : checkTrademarkRisk(label);

    const [resolvedAge, trademark] = await Promise.all([agePromise, trademarkPromise]);
    age = resolvedAge;

    const archive = (opts.lookupArchive !== false && opts.lookupAge !== false)
        ? await lookupArchiveHistory(domain, age?.registrationDate ?? null)
        : null;

    const effectiveAgeYears = Math.max(age?.ageYears ?? 0, archive?.archiveAgeYears ?? 0);
    const ageMultiplier = effectiveAgeYears > 0 ? 1 + Math.min(0.4, effectiveAgeYears * 0.02) : 1;

    const formulaPrice = linguisticBase * tldInfo.multiplier * keywordMultiplier * ageMultiplier;

    let exactComp: MatchedComp | null = null;
    try {
        const { rows: exactCompRows } = await getPool().query<MatchedComp>('SELECT * FROM comps WHERE domain = $1', [domain]);
        const exactCompRow = exactCompRows[0];
        if (exactCompRow) {
            exactComp = {
                ...exactCompRow,
                similarity: 100,
                matchReason: 'Exact historical domain sale record',
                compTier: 'high-relevance',
            };
        }
    } catch {
        // Fallback to static seed data
    }

    if (!exactComp) {
        const seedExact = COMPS.find((c) => c.domain.toLowerCase() === domain.toLowerCase());
        if (seedExact) {
            const parts = seedExact.domain.split('.');
            const label = parts[0] ?? '';
            exactComp = {
                domain: seedExact.domain,
                tld: parts.slice(1).join('.'),
                sale_price_usd: seedExact.salePriceUsd,
                sale_year: seedExact.saleYear,
                word_count: seedExact.wordCount,
                char_count: label.length,
                category: seedExact.category,
                source_note: seedExact.sourceNote,
                similarity: 100,
                matchReason: 'Exact historical domain sale record',
                compTier: 'high-relevance',
            };
        }
    }

    const compsResult = await findComps({
        tld,
        charCount,
        wordCount: wordCountTag,
        category: keywordMatch?.category ?? null,
        referencePriceUsd: formulaPrice,
    });

    let midUsd: number;
    let compsWeight: number;
    if (exactComp) {
        midUsd = exactComp.sale_price_usd;
        compsWeight = 1;
    } else {
        compsWeight = compsResult.weight;
        midUsd = compsResult.impliedPriceUsd !== null
            ? formulaPrice * (1 - compsWeight) + compsResult.impliedPriceUsd * compsWeight
            : formulaPrice;
    }

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

    const alternativeTlds = await checkAlternativeTlds({
        label,
        currentTld: tld,
        baseLinguisticUsd: linguisticBase,
        keywordMultiplier,
        effectiveAgeYears,
        currentMidUsd: Math.round(midUsd),
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
}): {
    confidence: Confidence;
    confidenceScore: number;
    confidenceFactors: ConfidenceFactor[];
    volatilityBandPercent: number;
} {
    const { exactComp, comps, compsWeight, tldAuthority, tld, linguisticScore, compositionScore, keywordMatch, archive, trademark } = params;

    // Factor 1: Comparable Sales Evidence (Weight 30%)
    let compScore = 35;
    let compDesc = 'Limited historical sales data in this exact bracket; baseline valuation relying primarily on heuristics.';
    let compImpact: 'positive' | 'neutral' | 'negative' = 'negative';

    if (exactComp) {
        compScore = 100;
        compDesc = `Verified historical recorded sale of this exact domain (${exactComp.domain}).`;
        compImpact = 'positive';
    } else if (comps.length > 0) {
        const topComp = comps[0];
        const topSimilarity = topComp?.similarity ?? 0;
        if (topSimilarity >= 80 && compsWeight >= 0.35 && topComp) {
            compScore = Math.min(95, Math.round(topSimilarity * 0.95 + comps.length * 2));
            compDesc = `Strong comparable evidence: ${comps.length} close market sales (top comp: ${topComp.domain} at ${topSimilarity}% match).`;
            compImpact = 'positive';
        } else if (topSimilarity >= 60 || compsWeight >= 0.2) {
            compScore = Math.min(80, Math.round(55 + topSimilarity * 0.3));
            compDesc = `Moderate comparable support: ${comps.length} sales with similar length/niche profile.`;
            compImpact = 'neutral';
        } else {
            compScore = Math.max(40, Math.round(topSimilarity * 0.7));
            compDesc = `Directional comps only; fewer direct market transactions recorded for this specific profile.`;
            compImpact = 'negative';
        }
    }

    // Factor 2: Extension Stability & Liquidity (Weight 20%)
    let tldScore = Math.round(tldAuthority);
    let tldDesc = `.${tld} has established secondary market liquidity and institutional recognition.`;
    let tldImpact: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (tld === 'com') {
        tldScore = 98;
        tldDesc = '.com represents universal global standard and maximum commercial buyer liquidity.';
        tldImpact = 'positive';
    } else if (['ai', 'io', 'org', 'net', 'co'].includes(tld)) {
        tldScore = Math.max(78, tldAuthority);
        tldDesc = `.${tld} is a liquid premium tier extension with established tech/institutional aftermarket.`;
        tldImpact = 'positive';
    } else if (tldAuthority < 50) {
        tldScore = Math.min(55, Math.max(25, tldAuthority));
        tldDesc = `.${tld} experiences lower aftermarket transaction volume; price discovery wider.`;
        tldImpact = 'negative';
    }

    // Factor 3: Lexical & Phonetic Determinism (Weight 20%)
    const lexScore = Math.min(100, Math.max(20, Math.round(compositionScore * 0.6 + linguisticScore * 0.4)));
    let lexDesc = 'Clean, dictionary-aligned spelling eliminates confusion and anchors perceived value.';
    let lexImpact: 'positive' | 'neutral' | 'negative' = 'positive';
    if (lexScore >= 80) {
        lexDesc = 'High clarity: standard vocabulary or intuitive brandable composition with zero radio-test ambiguity.';
        lexImpact = 'positive';
    } else if (lexScore >= 55) {
        lexDesc = 'Moderate lexical clarity: recognizable pattern, though partly reliant on brand positioning.';
        lexImpact = 'neutral';
    } else {
        lexDesc = 'Unconventional spelling, length, or invented construction creates wider variance in buyer valuation.';
        lexImpact = 'negative';
    }

    // Factor 4: Commercial Demand & Commercial Search Intent (Weight 15%)
    let comScore = 50;
    let comDesc = 'General consumer/brandable interest without high CPC keyword concentration.';
    let comImpact: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (keywordMatch) {
        if (keywordMatch.tier === '1') {
            comScore = 95;
            comDesc = `High-intent commercial keyword ("${keywordMatch.keyword}") with active industry advertiser bidding.`;
            comImpact = 'positive';
        } else if (keywordMatch.tier === '2') {
            comScore = 80;
            comDesc = `Established industry keyword ("${keywordMatch.keyword}") with verifiable commercial utility.`;
            comImpact = 'positive';
        } else {
            comScore = 65;
            comDesc = `Recognized commercial keyword ("${keywordMatch.keyword}").`;
            comImpact = 'neutral';
        }
    } else if (compositionScore >= 85 && tld === 'com') {
        comScore = 78;
        comDesc = 'Category-defining single dictionary word commanding universal commercial utility.';
        comImpact = 'positive';
    } else {
        comScore = 45;
        comDesc = 'No direct commercial advertiser bidding data; value is predominantly brandable.';
        comImpact = 'neutral';
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
        ddScore = 80;
        ddDesc = 'Virgin unindexed asset: clean slate with zero legacy spam, penalties, or PBN footprint.';
        ddImpact = 'positive';
    } else if (archive?.historicalContinuity === 'drop-risk') {
        ddScore = 60;
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
    let volatilityBandPercent = 70;

    if (trademark.riskLevel === 'severe') {
        confidence = 'low';
        confidenceScore = Math.min(35, confidenceScore);
        volatilityBandPercent = 85;
    } else if (confidenceScore >= 75 || exactComp) {
        confidence = 'high';
        volatilityBandPercent = 28;
    } else if (confidenceScore >= 50) {
        confidence = 'medium';
        volatilityBandPercent = 48;
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
}): LiquidityProfile {
    const { domain, tld, charCount, wordCount, isSingleWord, compositionScore, tldAuthority, trademark } = params;

    if (trademark && trademark.riskLevel === 'severe') {
        return {
            rating: 'Niche / Illiquid',
            score: 15,
            estimatedDaysToSell: 'Not Recommended',
            turnoverVelocity: 'slow',
            rationale: `Active trademark conflict against "${trademark.matches[0]?.mark}" presents critical UDRP forfeiture risk, preventing open commercial liquidity.`,
        };
    }

    const isCom = tld === 'com';
    const isTechLiquid = ['ai', 'io'].includes(tld);
    const label = domain.split('.')[0] ?? '';
    const hasHyphenOrNumbers = /[-0-9]/.test(label);

    const is2LCom = isCom && charCount === 2 && !hasHyphenOrNumbers;
    const is3LCom = isCom && charCount === 3 && !hasHyphenOrNumbers;
    const is4LCom = isCom && charCount === 4 && !hasHyphenOrNumbers;
    const isSingleWordCom = isCom && isSingleWord;

    if (is2LCom || is3LCom || (isSingleWordCom && compositionScore >= 90)) {
        return {
            rating: 'Ultra-Liquid',
            score: 96,
            estimatedDaysToSell: '7 - 30 days',
            turnoverVelocity: 'fast',
            rationale: is3LCom || is2LCom
                ? `${charCount}-letter .coms have an established floor price in wholesale auctions and trade instantly among portfolio investors.`
                : 'Top-tier dictionary .com words have constant inbound buyer demand and liquidate rapidly through wholesale dealer networks.',
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
