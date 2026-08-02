// Procedural brandable-name generation — word-blending against a small
// curated affix/synonym table. This is explicitly NOT an LLM call; it's a
// deterministic algorithm, and the UI says so. No paid API, no network
// call, fully reproducible.

const GENERIC_SUFFIXES = ['ly', 'io', 'hq', 'hub', 'base', 'loop', 'stack', 'wave', 'forge', 'spark', 'pulse', 'grid', 'labs', 'works'];
const GENERIC_PREFIXES = ['get', 'try', 'use', 'go'];

// A modest set of thematically-related words per category, used to blend
// with the seed term so suggestions stay on-topic rather than generic.
const CATEGORY_SYNONYMS: Record<string, string[]> = {
    ai: ['cortex', 'neuron', 'logic', 'cognition', 'signal', 'mind'],
    saas: ['flow', 'stack', 'sync', 'base', 'loop', 'grid'],
    finance: ['capital', 'vault', 'ledger', 'fund', 'wealth', 'coin'],
    crypto: ['chain', 'ledger', 'vault', 'node', 'block'],
    health: ['vital', 'pulse', 'care', 'wellness', 'thrive'],
    'real-estate': ['nest', 'estate', 'realty', 'dwell', 'haven'],
    legal: ['counsel', 'brief', 'clause', 'verdict'],
    business: ['ventures', 'works', 'group', 'partners'],
    travel: ['voyage', 'journey', 'roam', 'wander'],
    gaming: ['arcade', 'quest', 'arena', 'league'],
    retail: ['market', 'goods', 'supply', 'shop'],
    auto: ['motor', 'drive', 'garage', 'wheel'],
    food: ['kitchen', 'table', 'harvest', 'fork'],
    tech: ['byte', 'circuit', 'signal', 'node'],
    education: ['academy', 'campus', 'scholar', 'lesson'],
    'local-services': ['pro', 'crew', 'squad', 'local'],
    content: ['studio', 'press', 'stories', 'feed'],
    community: ['circle', 'collective', 'network', 'hub'],
};

function titleCaseSafe(word: string): string {
    return word.replace(/[^a-z]/gi, '').toLowerCase();
}

/**
 * Generates brandable candidate root labels by blending a seed word with
 * generic startup-brand affixes and category-relevant theme words.
 * Deduplicated, length-bounded, lowercase-alpha only.
 */
export function generateCandidates(seed: string, category: string | null, count = 10): string[] {
    const cleanSeed = titleCaseSafe(seed);
    if (cleanSeed.length < 2) return [];

    const themeWords = category ? (CATEGORY_SYNONYMS[category] ?? []) : [];

    const generic = new Set<string>();
    for (const suffix of GENERIC_SUFFIXES) generic.add(cleanSeed + suffix);
    for (const prefix of GENERIC_PREFIXES) generic.add(prefix + cleanSeed);

    const themed = new Set<string>();
    for (const theme of themeWords) {
        themed.add(cleanSeed + theme);
        themed.add(theme + cleanSeed);
        // Simple portmanteau: if the seed's tail overlaps the theme word's
        // head (or vice versa) by 1-2 letters, merge instead of concatenating.
        const overlap = findOverlap(cleanSeed, theme);
        if (overlap) themed.add(overlap);
    }

    const isValid = (c: string) => c.length >= 4 && c.length <= 18 && c !== cleanSeed;

    // Interleave themed and generic candidates so category-relevant names
    // (when available) aren't crowded out by the generic affix list.
    const themedList = [...themed].filter(isValid);
    const genericList = [...generic].filter(isValid);
    const interleaved: string[] = [];
    for (let i = 0; i < Math.max(themedList.length, genericList.length); i++) {
        if (themedList[i]) interleaved.push(themedList[i]!);
        if (genericList[i]) interleaved.push(genericList[i]!);
    }

    return [...new Set(interleaved)].slice(0, count);
}

function findOverlap(a: string, b: string): string | null {
    for (const len of [2, 1]) {
        if (a.length > len && b.length > len && a.slice(-len) === b.slice(0, len)) {
            return a.slice(0, -len) + b;
        }
    }
    return null;
}
