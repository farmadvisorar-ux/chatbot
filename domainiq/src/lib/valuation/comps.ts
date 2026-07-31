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
 * derives an implied price via similarity-weighted averaging.
 *
 * `referencePriceUsd` — the engine's own independent formula-only
 * estimate — is a required input, not just metadata. Without it, TLD and
 * length alone can match an ordinary domain against a wildly-unrelated
 * headline sale that merely happens to be a similar length .com (this
 * dataset's real comps skew toward famous, multi-million-dollar deals,
 * since those are what's publicly documented). Gating each comp's
 * contribution by how close its sale price is to the model's own
 * independent estimate keeps a $9k-quality domain from getting dragged
 * toward a $35M comp just because both are 9-character .com names.
 */
export async function findComps(params: {
    tld: string;
    charCount: number;
    wordCount: number;
    category: string | null;
    referencePriceUsd: number;
}): Promise<CompsResult> {
    const { rows } = await getPool().query<CompRow>('SELECT * FROM comps');

    const scored: MatchedComp[] = rows.map((row) => {
        // How close the comp's actual sale price is to this domain's own
        // independent baseline estimate, on a log scale (order-of-magnitude
        // match matters far more than exact-dollar match). 0-100.
        const priceRatio = Math.max(row.sale_price_usd, 1) / Math.max(params.referencePriceUsd, 1);
        const logRatio = Math.abs(Math.log10(priceRatio));
        const priceSimilarity = Math.max(0, 100 - logRatio * 45);

        let characteristics = 0;
        if (row.tld === params.tld) characteristics += 34;
        else if (isPremiumGroup(row.tld) === isPremiumGroup(params.tld)) characteristics += 10;

        if (params.category && row.category === params.category) characteristics += 34;

        const lenDiff = Math.abs(row.char_count - params.charCount);
        characteristics += Math.max(0, 22 - lenDiff * 2.2);

        if (row.word_count === params.wordCount) characteristics += 10;

        // Price plausibility carries the most weight — matching
        // TLD/category/length on a domain that isn't remotely the same
        // quality tier shouldn't count for much.
        const similarity = Math.round(priceSimilarity * 0.55 + characteristics * 0.45);

        return { ...row, similarity };
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
    const weight = Math.min(0.6, (avgSimilarity / 100) * countFactor);

    return { matches: top, impliedPriceUsd, weight };
}

function isPremiumGroup(tld: string): boolean {
    return ['com', 'net', 'org', 'io', 'ai', 'co'].includes(tld);
}
