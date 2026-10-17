export type KeywordTier = 'S' | 'A' | 'B' | 'C';

export interface KeywordInfo {
    tier: KeywordTier;
    multiplier: number;
    category: string;
}

// Rough proxy for commercial "buyer intent" value, in the same spirit as
// high-CPC advertising categories: money (insurance, loans, crypto),
// health, and legal consistently draw the highest end-buyer budgets;
// generic retail/content terms draw the least. Matched against the
// domain's root label as whole words or word-boundary substrings.
export const KEYWORDS: Record<string, KeywordInfo> = {
    // --- Tier S: highest commercial intent ---
    insurance: { tier: 'S', multiplier: 4.0, category: 'finance' },
    loans: { tier: 'S', multiplier: 3.6, category: 'finance' },
    loan: { tier: 'S', multiplier: 3.4, category: 'finance' },
    mortgage: { tier: 'S', multiplier: 3.8, category: 'finance' },
    credit: { tier: 'S', multiplier: 3.2, category: 'finance' },
    casino: { tier: 'S', multiplier: 3.5, category: 'gaming' },
    bet: { tier: 'S', multiplier: 3.0, category: 'gaming' },
    betting: { tier: 'S', multiplier: 3.2, category: 'gaming' },
    crypto: { tier: 'S', multiplier: 3.4, category: 'crypto' },
    bitcoin: { tier: 'S', multiplier: 3.3, category: 'crypto' },
    lawyer: { tier: 'S', multiplier: 3.6, category: 'legal' },
    attorney: { tier: 'S', multiplier: 3.6, category: 'legal' },
    rehab: { tier: 'S', multiplier: 3.0, category: 'health' },
    ai: { tier: 'S', multiplier: 3.2, category: 'ai' },

    // --- Tier A: strong commercial intent ---
    bank: { tier: 'A', multiplier: 2.6, category: 'finance' },
    invest: { tier: 'A', multiplier: 2.4, category: 'finance' },
    trading: { tier: 'A', multiplier: 2.3, category: 'finance' },
    fund: { tier: 'A', multiplier: 2.4, category: 'finance' },
    wallet: { tier: 'A', multiplier: 2.2, category: 'crypto' },
    nft: { tier: 'A', multiplier: 2.3, category: 'crypto' },
    poker: { tier: 'A', multiplier: 2.4, category: 'gaming' },
    slots: { tier: 'A', multiplier: 2.3, category: 'gaming' },
    hotel: { tier: 'A', multiplier: 2.2, category: 'travel' },
    hotels: { tier: 'A', multiplier: 2.3, category: 'travel' },
    flights: { tier: 'A', multiplier: 2.1, category: 'travel' },
    travel: { tier: 'A', multiplier: 2.0, category: 'travel' },
    rentals: { tier: 'A', multiplier: 2.1, category: 'travel' },
    medicare: { tier: 'A', multiplier: 2.5, category: 'health' },
    health: { tier: 'A', multiplier: 2.0, category: 'health' },
    dental: { tier: 'A', multiplier: 2.1, category: 'health' },
    clinic: { tier: 'A', multiplier: 2.0, category: 'health' },
    realestate: { tier: 'A', multiplier: 2.3, category: 'real-estate' },
    realty: { tier: 'A', multiplier: 2.2, category: 'real-estate' },
    homes: { tier: 'A', multiplier: 2.0, category: 'real-estate' },
    property: { tier: 'A', multiplier: 2.0, category: 'real-estate' },
    jet: { tier: 'A', multiplier: 2.4, category: 'travel' },
    diamond: { tier: 'A', multiplier: 2.1, category: 'retail' },
    jewelry: { tier: 'A', multiplier: 2.0, category: 'retail' },
    cars: { tier: 'A', multiplier: 2.1, category: 'auto' },
    auto: { tier: 'A', multiplier: 2.0, category: 'auto' },

    // --- Tier B: moderate commercial intent ---
    shop: { tier: 'B', multiplier: 1.6, category: 'retail' },
    store: { tier: 'B', multiplier: 1.5, category: 'retail' },
    market: { tier: 'B', multiplier: 1.5, category: 'retail' },
    fashion: { tier: 'B', multiplier: 1.5, category: 'retail' },
    shoes: { tier: 'B', multiplier: 1.5, category: 'retail' },
    clothes: { tier: 'B', multiplier: 1.5, category: 'retail' },
    beauty: { tier: 'B', multiplier: 1.6, category: 'retail' },
    fitness: { tier: 'B', multiplier: 1.6, category: 'health' },
    yoga: { tier: 'B', multiplier: 1.4, category: 'health' },
    school: { tier: 'B', multiplier: 1.5, category: 'education' },
    academy: { tier: 'B', multiplier: 1.5, category: 'education' },
    learn: { tier: 'B', multiplier: 1.4, category: 'education' },
    courses: { tier: 'B', multiplier: 1.4, category: 'education' },
    cloud: { tier: 'B', multiplier: 1.7, category: 'saas' },
    app: { tier: 'B', multiplier: 1.5, category: 'saas' },
    software: { tier: 'B', multiplier: 1.6, category: 'saas' },
    tech: { tier: 'B', multiplier: 1.5, category: 'tech' },
    data: { tier: 'B', multiplier: 1.6, category: 'ai' },
    agents: { tier: 'B', multiplier: 1.7, category: 'ai' },
    chat: { tier: 'B', multiplier: 1.6, category: 'ai' },
    metaverse: { tier: 'B', multiplier: 1.5, category: 'tech' },
    pizza: { tier: 'B', multiplier: 1.4, category: 'food' },
    coffee: { tier: 'B', multiplier: 1.4, category: 'food' },
    candy: { tier: 'B', multiplier: 1.3, category: 'food' },
    pets: { tier: 'B', multiplier: 1.4, category: 'retail' },
    toys: { tier: 'B', multiplier: 1.4, category: 'retail' },
    games: { tier: 'B', multiplier: 1.5, category: 'gaming' },

    // --- Tier C: mild lift, generic/content terms ---
    blog: { tier: 'C', multiplier: 1.1, category: 'content' },
    news: { tier: 'C', multiplier: 1.15, category: 'content' },
    guide: { tier: 'C', multiplier: 1.1, category: 'content' },
    tips: { tier: 'C', multiplier: 1.05, category: 'content' },
    daily: { tier: 'C', multiplier: 1.1, category: 'content' },
    world: { tier: 'C', multiplier: 1.1, category: 'content' },
    hub: { tier: 'C', multiplier: 1.15, category: 'content' },
    zone: { tier: 'C', multiplier: 1.1, category: 'content' },
    club: { tier: 'C', multiplier: 1.15, category: 'community' },
    social: { tier: 'C', multiplier: 1.2, category: 'tech' },
};

const sortedKeys = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length);

export interface KeywordMatch extends KeywordInfo {
    keyword: string;
}

/** Finds the highest-tier keyword contained in `label`, if any. */
export function bestKeywordMatch(label: string): KeywordMatch | null {
    const lower = label.toLowerCase();
    let best: KeywordMatch | null = null;
    for (const key of sortedKeys) {
        if (lower.includes(key)) {
            const info = KEYWORDS[key]!;
            if (!best || info.multiplier > best.multiplier) {
                best = { ...info, keyword: key };
            }
        }
    }
    return best;
}
