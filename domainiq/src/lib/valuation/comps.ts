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
 * Finds the most relevant historical sales for a target domain and
 * derives an implied price via similarity-weighted averaging.
 *
 * Gating each comp's contribution by how close its sale price is to
 * the model's own independent estimate keeps an average domain from getting
 * distorted by headline mega-sales while heavily rewarding verified
 * real-market comps of similar quality.
 */
export async function findComps(params: {
    tld: string;
    charCount: number;
    wordCount: number;
    category: string | null;
    referencePriceUsd: number;
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
        const priceRatio = Math.max(row.sale_price_usd, 1) / Math.max(params.referencePriceUsd, 1);
        const logRatio = Math.abs(Math.log10(priceRatio));
        const priceSimilarity = Math.max(0, 100 - logRatio * 45);

        let characteristics = 0;
        const reasons: string[] = [];

        if (row.tld === params.tld) {
            characteristics += 35;
            reasons.push(`Exact .${row.tld} match`);
        } else if (isPremiumGroup(row.tld) && isPremiumGroup(params.tld)) {
            characteristics += 14;
            reasons.push(`Top-tier TLD group (.${row.tld})`);
        }

        if (params.category && row.category === params.category) {
            characteristics += 32;
            reasons.push(`Same ${params.category} sector`);
        }

        const lenDiff = Math.abs(row.char_count - params.charCount);
        if (lenDiff <= 1) {
            characteristics += 20;
            reasons.push(`Equivalent length (${row.char_count} chars)`);
        } else if (lenDiff <= 3) {
            characteristics += 12;
            reasons.push(`Similar length`);
        }

        if (row.word_count === params.wordCount) {
            characteristics += 13;
            reasons.push(`${row.word_count === 1 ? 'Single word' : row.word_count === 2 ? 'Two-word compound' : 'Brandable pattern'}`);
        }

        const similarity = Math.round(priceSimilarity * 0.52 + characteristics * 0.48);

        let compTier: 'high-relevance' | 'medium-relevance' | 'directional' = 'directional';
        if (similarity >= 75) compTier = 'high-relevance';
        else if (similarity >= 50) compTier = 'medium-relevance';

        const matchReason = reasons.slice(0, 2).join(' · ') || 'Similar market profile';

        return {
            ...row,
            similarity,
            matchReason,
            compTier,
        };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.filter((c) => c.similarity >= 40).slice(0, 8);

    if (top.length === 0) {
        return { matches: scored.slice(0, 3), impliedPriceUsd: null, weight: 0 };
    }

    const totalWeight = top.reduce((sum, c) => sum + c.similarity, 0);
    const impliedPriceUsd = top.reduce((sum, c) => sum + c.sale_price_usd * c.similarity, 0) / totalWeight;

    // Weight grows with number of decent matches and their average similarity.
    const avgSimilarity = totalWeight / top.length;
    const countFactor = Math.min(1, top.length / 4);
    const weight = Math.min(0.65, (avgSimilarity / 100) * countFactor);

    return { matches: top, impliedPriceUsd, weight };
}

function isPremiumGroup(tld: string): boolean {
    return ['com', 'net', 'org', 'io', 'ai', 'co', 'app', 'dev'].includes(tld);
}
