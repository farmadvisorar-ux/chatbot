import { getPool } from '../db';
import { COMPS } from '@/data/comps-seed';

export interface CompRow {
    domain: string;
    tld: string;
    sale_price_usd: number;
    sale_year: number | null;
    word_count: number;
    char_count: number;
    category: string | null;
    source_note: string;
}

export interface MatchedComp extends CompRow {
    present_value_usd: number;
    similarity: number;
    matchReason: string;
    compTier: 'high-relevance' | 'medium-relevance' | 'directional';
}

export interface CompsResult {
    matches: MatchedComp[];
    impliedPriceUsd: number | null;
    weight: number; // 0-1, how much this signal should count vs. the formula estimate
}

/**
 * Finds the most relevant historical sales for a target domain using
 * multivariate KNN similarity regression with 2026 present-value time normalization.
 */
export async function findComps(params: {
    tld: string;
    charCount: number;
    wordCount: number;
    category: string | null;
    referencePriceUsd: number;
    structuralArchetypeKey?: string;
    label?: string;
}): Promise<CompsResult> {
    let rows: CompRow[] = [];

    try {
        const dbRes = await getPool().query<CompRow>('SELECT * FROM comps');
        if (dbRes.rows && dbRes.rows.length > 0) {
            rows = dbRes.rows;
        }
    } catch {
        // Database unavailable or cold start; use rich embedded dataset
    }

    if (rows.length === 0) {
        rows = COMPS.map((c) => {
            const parts = c.domain.split('.');
            const tld = parts.slice(1).join('.');
            const label = parts[0] ?? '';
            return {
                domain: c.domain,
                tld,
                sale_price_usd: c.salePriceUsd,
                sale_year: c.saleYear,
                word_count: c.wordCount,
                char_count: label.length,
                category: c.category,
                source_note: c.sourceNote,
            };
        });
    }

    const scored: MatchedComp[] = rows.map((row) => {
        // 1. Time-Decayed Present-Value Normalization (3.2% compound index up to 2026)
        const saleYear = row.sale_year ?? 2020;
        const yearsElapsed = Math.max(0, 2026 - saleYear);
        const inflationFactor = Math.pow(1.032, yearsElapsed);
        const presentValueUsd = Math.round(row.sale_price_usd * inflationFactor);

        // 2. Price proximity ratio against present-value adjusted comp
        const priceRatio = Math.max(presentValueUsd, 1) / Math.max(params.referencePriceUsd, 1);
        const logRatio = Math.abs(Math.log10(priceRatio));
        const priceSimilarity = Math.max(0, 100 - logRatio * 38);

        // 3. Characteristic distance metrics
        let characteristics = 0;
        const reasons: string[] = [];

        // Exact or sister TLD match
        if (row.tld === params.tld) {
            characteristics += 35;
            reasons.push(`Exact .${row.tld} match`);
        } else if (isPremiumGroup(row.tld) && isPremiumGroup(params.tld)) {
            characteristics += 18;
            reasons.push(`Top-tier TLD sister group (.${row.tld})`);
        }

        // Category/Industry match
        if (params.category && row.category === params.category) {
            characteristics += 30;
            reasons.push(`Same ${params.category} sector`);
        }

        // Length similarity
        const lenDiff = Math.abs(row.char_count - params.charCount);
        if (lenDiff === 0) {
            characteristics += 25;
            reasons.push(`Exact ${row.char_count}-character length`);
        } else if (lenDiff <= 1) {
            characteristics += 18;
            reasons.push(`Equivalent length (${row.char_count} chars)`);
        } else if (lenDiff <= 3) {
            characteristics += 10;
            reasons.push(`Similar length`);
        }

        // Word pattern & structural archetype match
        if (row.word_count === params.wordCount) {
            characteristics += 15;
            reasons.push(row.word_count === 1 ? 'Single word' : row.word_count === 2 ? 'Two-word compound' : 'Brandable pattern');
        }

        // Special short-character investor archetype matching
        if (params.charCount <= 3 && row.char_count <= 3 && params.tld === 'com' && row.tld === 'com') {
            characteristics += 25;
            reasons.push('Liquid short .com asset class');
        }

        const similarity = Math.min(99, Math.round(priceSimilarity * 0.45 + characteristics * 0.55));

        let compTier: 'high-relevance' | 'medium-relevance' | 'directional' = 'directional';
        if (similarity >= 75) compTier = 'high-relevance';
        else if (similarity >= 50) compTier = 'medium-relevance';

        const matchReason = reasons.slice(0, 2).join(' · ') || 'Similar market profile';

        return {
            ...row,
            present_value_usd: presentValueUsd,
            similarity,
            matchReason,
            compTier,
        };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.filter((c) => c.similarity >= 38).slice(0, 8);

    if (top.length === 0) {
        return { matches: scored.slice(0, 3), impliedPriceUsd: null, weight: 0 };
    }

    const totalWeight = top.reduce((sum, c) => sum + c.similarity, 0);
    // Implied price is calculated on present-value adjusted benchmarks
    const impliedPriceUsd = top.reduce((sum, c) => sum + c.present_value_usd * c.similarity, 0) / totalWeight;

    // Weight grows with quality and similarity of top comps
    const avgSimilarity = totalWeight / top.length;
    const countFactor = Math.min(1, top.length / 4);
    const weight = Math.min(0.70, (avgSimilarity / 100) * countFactor);

    return { matches: top, impliedPriceUsd, weight };
}

function isPremiumGroup(tld: string): boolean {
    return ['com', 'net', 'org', 'io', 'ai', 'co', 'app', 'dev'].includes(tld);
}
