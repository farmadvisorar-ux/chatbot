import { getPool } from '../db';

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
}

export interface CompsResult {
    matches: MatchedComp[];
    impliedPriceUsd: number | null;
    weight: number; // 0-1, how much this signal should count vs. the formula estimate
}

/**
 * Finds the most relevant historical sales for a target domain and
 * derives an implied price via similarity-weighted averaging. Returns a
 * `weight` telling the engine how much to trust this comps signal — few
 * or weak matches should barely move the formula-driven estimate.
 */
export async function findComps(params: {
    tld: string;
    charCount: number;
    wordCount: number;
    category: string | null;
}): Promise<CompsResult> {
    const { rows } = await getPool().query<CompRow>('SELECT * FROM comps');

    const scored: MatchedComp[] = rows.map((row) => {
        let similarity = 0;
        if (row.tld === params.tld) similarity += 40;
        else if (isPremiumGroup(row.tld) === isPremiumGroup(params.tld)) similarity += 12;

        if (params.category && row.category === params.category) similarity += 32;

        const lenDiff = Math.abs(row.char_count - params.charCount);
        similarity += Math.max(0, 24 - lenDiff * 2.4);

        if (row.word_count === params.wordCount) similarity += 4;

        return { ...row, similarity: Math.round(similarity) };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.filter((c) => c.similarity >= 30).slice(0, 6);

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
    return ['com', 'net', 'org', 'io', 'ai', 'co'].includes(tld);
}
