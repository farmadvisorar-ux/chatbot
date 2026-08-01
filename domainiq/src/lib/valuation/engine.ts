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
import { getPool } from '../db';

export type Confidence = 'low' | 'medium' | 'high';

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
    channelPricing: ChannelPricing;
    outboundFitScore: number;
    trademark: TrademarkResult;
    gtm: GtmStrategy;
    generatedAt: string;
}

export async function evaluateDomain(
    input: string,
    opts: { lookupAge?: boolean; checkTrademark?: boolean } = {},
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
    if (opts.lookupAge) {
        age = await lookupDomainAge(domain);
    }
    const ageMultiplier = age?.ageYears ? 1 + Math.min(0.4, age.ageYears * 0.02) : 1;

    const formulaPrice = linguisticBase * tldInfo.multiplier * keywordMultiplier * ageMultiplier;

    const { rows: exactCompRows } = await getPool().query<MatchedComp>('SELECT * FROM comps WHERE domain = $1', [domain]);
    const exactCompRow = exactCompRows[0];
    const exactComp = exactCompRow ? { ...exactCompRow, similarity: 100 } : null;

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

    let confidence: Confidence = 'low';
    if (exactComp) confidence = 'high';
    else if (compsWeight >= 0.4 && tldInfo.authority >= 50) confidence = 'high';
    else if (compsWeight >= 0.15 || tldInfo.authority >= 60) confidence = 'medium';

    const rangeFactors: Record<Confidence, [number, number]> = {
        high: [0.65, 1.5],
        medium: [0.5, 2.0],
        low: [0.3, 3.2],
    };
    const [lowFactor, highFactor] = rangeFactors[confidence];

    const lowUsd = Math.round(midUsd * lowFactor);
    const highUsd = Math.round(midUsd * highFactor);

    const channelPricing = computeChannelPricing({ lowUsd, midUsd: Math.round(midUsd), highUsd, vertical });
    const outboundFitScore = computeOutboundFitScore({
        vertical,
        hasKeywordMatch: Boolean(keywordMatch),
        compositionScore,
        tldAuthority: tldInfo.authority,
    });

    const trademark = opts.checkTrademark === false
        ? { checked: false, source: 'heuristic-only' as const, riskLevel: 'unknown' as const, matches: [], disclaimer: 'Trademark screening skipped for this request.' }
        : await checkTrademarkRisk(label);

    const compositionQuality: 'strong' | 'moderate' | 'weak' = compositionScore >= 80 ? 'strong' : compositionScore >= 50 ? 'moderate' : 'weak';
    const gtm = generateGtmStrategy({
        label,
        tld,
        vertical,
        keywordTier: keywordMatch?.tier ?? null,
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
        channelPricing,
        outboundFitScore,
        trademark,
        gtm,
        generatedAt: new Date().toISOString(),
    };
}

export async function recordValuation(result: ValuationResult): Promise<void> {
    await getPool().query(
        `INSERT INTO valuations (domain, score, low_usd, mid_usd, high_usd, confidence, breakdown_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [result.domain, result.linguisticScore, result.lowUsd, result.midUsd, result.highUsd, result.confidence, JSON.stringify(result)],
    );
}
