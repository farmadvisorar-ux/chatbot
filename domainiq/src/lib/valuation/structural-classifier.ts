import { isDictionaryWord, segmentLabel } from './dictionary';

export type StructuralArchetypeKey =
    | 'APEX_1L_COM'
    | 'APEX_2L_COM'
    | 'APEX_3L_COM'
    | 'NUMERIC_2N_COM'
    | 'NUMERIC_3N_COM'
    | 'NUMERIC_4N_COM'
    | 'NUMERIC_5N_COM'
    | '4L_CVCV_COM'
    | '4L_CHIP_COM'
    | '4L_WESTERN_COM'
    | '1WORD_APEX_DICTIONARY'
    | '1WORD_PREMIUM_DICTIONARY'
    | '1WORD_SPECIALTY_DICTIONARY'
    | '2WORD_POWER_BRANDABLE'
    | '2WORD_STANDARD_DESCRIPTIVE'
    | 'TECH_APEX_EXPANSION'
    | 'LONG_TAIL_DESCRIPTIVE'
    | 'ALPHANUMERIC_HYBRID'
    | 'HYPHENATED_PENALTY'
    | 'COINED_BRANDABLE';

export interface StructuralArchetypeInfo {
    key: StructuralArchetypeKey;
    label: string;
    rarity: 'Generational Scarcity' | 'Extreme Scarcity' | 'High Scarcity' | 'Selective Scarcity' | 'Abundant';
    marketFloorUsd: number;
    structuralMultiplier: number;
    investorDescription: string;
    totalPossibleUniverse: number | null; // e.g. 26 for 1L, 676 for 2L, 17576 for 3L
}

// Power brandable prefixes and suffixes heavily used by venture-backed startups and major tech companies
const POWER_PREFIXES = new Set([
    'get', 'go', 'try', 'the', 'my', 'we', 'our', 'all', 'pro', 'smart',
    'hyper', 'super', 'meta', 'omni', 'sync', 'open', 'true', 'pure', 'neo',
    'pay', 'cloud', 'data', 'auto', 'cyber', 'block', 'agent', 'fast', 'quick'
]);

const POWER_SUFFIXES = new Set([
    'hq', 'ai', 'io', 'app', 'hub', 'flow', 'labs', 'box', 'stack', 'base',
    'pay', 'sync', 'desk', 'vault', 'link', 'core', 'grid', 'pulse', 'wave',
    'path', 'shift', 'lane', 'gate', 'lock', 'zone', 'cast', 'craft', 'forge'
]);

// Top-tier category killer English words that command generational institutional equity
const APEX_CATEGORY_WORDS = new Set([
    'insurance', 'loans', 'loan', 'mortgage', 'credit', 'bank', 'invest', 'fund',
    'casino', 'bet', 'poker', 'crypto', 'bitcoin', 'wallet', 'token', 'lawyer',
    'attorney', 'health', 'rehab', 'clinic', 'cars', 'auto', 'hotel', 'hotels',
    'flights', 'travel', 'rentals', 'homes', 'realty', 'property', 'cloud', 'data',
    'voice', 'sound', 'audio', 'video', 'chat', 'agent', 'agents', 'ai', 'tech',
    'code', 'dev', 'security', 'secure', 'shield', 'pay', 'payments', 'capital',
    'diamond', 'shoes', 'clothes', 'food', 'pizza', 'jobs', 'work', 'weather',
    'news', 'sports', 'golf', 'game', 'games', 'play', 'live', 'stream'
]);

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// Chinese chip consonants (no vowels, no V)
const CHIP_CONSONANTS = new Set(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'w', 'x', 'y', 'z']);

/**
 * Classifies a domain into its precise professional investor structural archetype.
 * This structural classification forms the baseline scarcity floor of the valuation engine.
 */
export function classifyStructuralArchetype(label: string, tld: string): StructuralArchetypeInfo {
    const isCom = tld.toLowerCase() === 'com';
    const isTechLiquid = ['ai', 'io'].includes(tld.toLowerCase());
    const len = label.length;
    const lower = label.toLowerCase();
    const isAllLetters = /^[a-z]+$/.test(lower);
    const isAllDigits = /^[0-9]+$/.test(lower);
    const hasHyphen = lower.includes('-');
    const hasDigits = /\d/.test(lower);

    // 1. Hyphenated penalty
    if (hasHyphen) {
        return {
            key: 'HYPHENATED_PENALTY',
            label: 'Hyphenated Synthetic String',
            rarity: 'Abundant',
            marketFloorUsd: 15,
            structuralMultiplier: 0.15,
            investorDescription: 'Hyphens impose severe friction on direct type-in traffic, verbal recall, and institutional brand credibility.',
            totalPossibleUniverse: null,
        };
    }

    // 2. Numeric Domains
    if (isAllDigits) {
        if (len === 2 && isCom) {
            return {
                key: 'NUMERIC_2N_COM',
                label: '2-Number Apex .COM (2N)',
                rarity: 'Extreme Scarcity',
                marketFloorUsd: 850_000,
                structuralMultiplier: 35.0,
                investorDescription: 'Only 100 2-digit .com combinations exist (00-99). Universally recognized high-liquidity financial asset.',
                totalPossibleUniverse: 100,
            };
        }
        if (len === 3 && isCom) {
            return {
                key: 'NUMERIC_3N_COM',
                label: '3-Number Liquid .COM (3N)',
                rarity: 'High Scarcity',
                marketFloorUsd: 120_000,
                structuralMultiplier: 12.0,
                investorDescription: 'Only 1,000 combinations exist (000-999). Extremely liquid in global investment and auction networks.',
                totalPossibleUniverse: 1_000,
            };
        }
        if (len === 4 && isCom) {
            return {
                key: 'NUMERIC_4N_COM',
                label: '4-Number Secondary .COM (4N)',
                rarity: 'Selective Scarcity',
                marketFloorUsd: 12_000,
                structuralMultiplier: 4.5,
                investorDescription: '10,000 combinations (0000-9999) with established wholesale market bid floors.',
                totalPossibleUniverse: 10_000,
            };
        }
        if (len === 5 && isCom) {
            return {
                key: 'NUMERIC_5N_COM',
                label: '5-Number .COM (5N)',
                rarity: 'Selective Scarcity',
                marketFloorUsd: 1_200,
                structuralMultiplier: 1.8,
                investorDescription: 'Active trading tier on wholesale exchanges, valued for symmetry and auspicious digit patterns.',
                totalPossibleUniverse: 100_000,
            };
        }
    }

    // 3. Ultra-Short Letter Domains (1L, 2L, 3L)
    if (isAllLetters) {
        if (len === 1 && isCom) {
            return {
                key: 'APEX_1L_COM',
                label: 'Single-Letter Apex Sovereign .COM (1L)',
                rarity: 'Generational Scarcity',
                marketFloorUsd: 15_000_000,
                structuralMultiplier: 120.0,
                investorDescription: 'Only 26 exist in the entire digital universe (e.g. x.com, z.com, q.com). The rarest digital real estate in human history.',
                totalPossibleUniverse: 26,
            };
        }

        if (len === 2 && isCom) {
            return {
                key: 'APEX_2L_COM',
                label: 'Two-Letter Sovereign .COM (LL.com)',
                rarity: 'Extreme Scarcity',
                marketFloorUsd: 850_000,
                structuralMultiplier: 40.0,
                investorDescription: 'Only 676 2-letter .com domains exist worldwide. Highest liquidity and corporate prestige of any 2-character asset class.',
                totalPossibleUniverse: 676,
            };
        }

        if (len === 3 && isCom) {
            return {
                key: 'APEX_3L_COM',
                label: 'Three-Letter Liquid .COM (LLL.com)',
                rarity: 'High Scarcity',
                marketFloorUsd: 38_000,
                structuralMultiplier: 10.0,
                investorDescription: 'Exactly 17,576 combinations exist. Instant cash liquidity in wholesale dealer networks and global auctions.',
                totalPossibleUniverse: 17_576,
            };
        }

        // 4. Four-Letter .COM Variations (CVCV vs Chips vs Western)
        if (len === 4 && isCom) {
            const isCVCV =
                !VOWELS.has(lower[0]!) &&
                VOWELS.has(lower[1]!) &&
                !VOWELS.has(lower[2]!) &&
                VOWELS.has(lower[3]!);

            if (isCVCV) {
                return {
                    key: '4L_CVCV_COM',
                    label: '4-Letter CVCV Brandable .COM',
                    rarity: 'Selective Scarcity',
                    marketFloorUsd: 18_000,
                    structuralMultiplier: 6.5,
                    investorDescription: 'Consonant-Vowel-Consonant-Vowel construction (e.g. boba, zivo, kiku). Peak phonetic fluency and VC startup demand.',
                    totalPossibleUniverse: 11_025,
                };
            }

            const isChip = [...lower].every((ch) => CHIP_CONSONANTS.has(ch));
            if (isChip) {
                return {
                    key: '4L_CHIP_COM',
                    label: '4-Letter CHIP .COM (Chinese Investor Quad)',
                    rarity: 'Selective Scarcity',
                    marketFloorUsd: 2_200,
                    structuralMultiplier: 2.5,
                    investorDescription: 'Consonants without vowels or V. Established wholesale trading benchmark among Asian domain investment syndicates.',
                    totalPossibleUniverse: 160_000,
                };
            }

            return {
                key: '4L_WESTERN_COM',
                label: '4-Letter Brandable Quad .COM (LLLL.com)',
                rarity: 'Selective Scarcity',
                marketFloorUsd: 3_500,
                structuralMultiplier: 3.0,
                investorDescription: 'Western 4-letter .com asset with broad brandability potential and established wholesale liquidity.',
                totalPossibleUniverse: 456_976,
            };
        }
    }

    // 5. Dictionary Words
    const isSingleWord = isDictionaryWord(lower);
    if (isSingleWord && isCom) {
        if (APEX_CATEGORY_WORDS.has(lower)) {
            return {
                key: '1WORD_APEX_DICTIONARY',
                label: 'Apex Category-Killer English Noun .COM',
                rarity: 'Extreme Scarcity',
                marketFloorUsd: 500_000,
                structuralMultiplier: 25.0,
                investorDescription: 'Generational single-word dictionary asset commanding unassailable industry authority, instant organic trust, and massive search savings.',
                totalPossibleUniverse: 350,
            };
        }

        if (len <= 7) {
            return {
                key: '1WORD_PREMIUM_DICTIONARY',
                label: 'High-Impact Dictionary English Word .COM',
                rarity: 'High Scarcity',
                marketFloorUsd: 45_000,
                structuralMultiplier: 8.5,
                investorDescription: 'Concise English dictionary word with immediate universal recognition and enterprise brandability.',
                totalPossibleUniverse: 4_500,
            };
        }

        return {
            key: '1WORD_SPECIALTY_DICTIONARY',
            label: 'Specialty Dictionary Word .COM',
            rarity: 'Selective Scarcity',
            marketFloorUsd: 15_000,
            structuralMultiplier: 4.5,
            investorDescription: 'Single dictionary word with defined linguistic meaning, perfect radio test clarity, and solid aftermarket retention.',
            totalPossibleUniverse: 25_000,
        };
    }

    // 6. Modern Tech Extensions (.AI, .IO) for Single Words
    if (isSingleWord && isTechLiquid) {
        return {
            key: 'TECH_APEX_EXPANSION',
            label: `Single-Word Tech Sovereign .${tld.toUpperCase()}`,
            rarity: 'High Scarcity',
            marketFloorUsd: 35_000,
            structuralMultiplier: 7.0,
            investorDescription: `Single English dictionary word in primary tech expansion extension (.${tld.toLowerCase()}). High velocity among venture-backed startups.`,
            totalPossibleUniverse: 10_000,
        };
    }

    // 7. Compound Words (2-Word Analysis)
    const segmentation = segmentLabel(lower);
    if (segmentation.words.length === 2 && segmentation.coverage === 1) {
        const [w1, w2] = segmentation.words as [string, string];
        const hasPowerPrefix = POWER_PREFIXES.has(w1);
        const hasPowerSuffix = POWER_SUFFIXES.has(w2);

        if ((hasPowerPrefix || hasPowerSuffix) && isCom) {
            return {
                key: '2WORD_POWER_BRANDABLE',
                label: 'Power-Affix Compound Brandable .COM',
                rarity: 'Selective Scarcity',
                marketFloorUsd: 6_500,
                structuralMultiplier: 3.8,
                investorDescription: 'Engineered brandable compound combining high-conversion commercial action verbs or authority suffixes with a clean root noun.',
                totalPossibleUniverse: null,
            };
        }

        if (isCom) {
            return {
                key: '2WORD_STANDARD_DESCRIPTIVE',
                label: 'Clean Two-Word Commercial .COM',
                rarity: 'Selective Scarcity',
                marketFloorUsd: 2_400,
                structuralMultiplier: 2.2,
                investorDescription: 'Legitimate two-word dictionary compound with unambiguous spelling and straightforward commercial positioning.',
                totalPossibleUniverse: null,
            };
        }
    }

    // 8. Long-Tail
    if (segmentation.words.length >= 3) {
        return {
            key: 'LONG_TAIL_DESCRIPTIVE',
            label: 'Multi-Word Long-Tail Phrase',
            rarity: 'Abundant',
            marketFloorUsd: 150,
            structuralMultiplier: 0.6,
            investorDescription: 'Three or more words. Lower secondary market velocity, primarily suited for niche operational projects or local services.',
            totalPossibleUniverse: null,
        };
    }

    // 9. Alphanumeric Hybrid
    if (hasDigits && !isAllDigits) {
        return {
            key: 'ALPHANUMERIC_HYBRID',
            label: 'Alphanumeric Mixed Hybrid',
            rarity: 'Abundant',
            marketFloorUsd: 80,
            structuralMultiplier: 0.4,
            investorDescription: 'Mixed letters and digits suffer from phonetic ambiguity ("is 2 spelled two or 2?"), significantly dampening direct aftermarket liquidity.',
            totalPossibleUniverse: null,
        };
    }

    // 10. Coined Brandable Fallback
    return {
        key: 'COINED_BRANDABLE',
        label: 'Invented / Coined Brandable String',
        rarity: 'Selective Scarcity',
        marketFloorUsd: 800,
        structuralMultiplier: 1.2,
        investorDescription: 'Synthetic coined term evaluated on phonetic fluency, memorability, syllable count, and brand positioning potential.',
        totalPossibleUniverse: null,
    };
}
