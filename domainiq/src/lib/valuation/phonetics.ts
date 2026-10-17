export interface PhoneticResult {
    score: number; // 0-100, "pass-the-radio-test" clarity
    notes: string[];
}

// Clusters that commonly create ambiguity when a domain is only heard
// spoken aloud (someone has to guess the spelling afterward) — silent or
// non-obvious letter combinations, not just hard-to-say ones (that's
// covered separately by scoreBrandability's pronounceability checks).
const AMBIGUOUS_CLUSTERS = ['ph', 'gh', 'kn', 'wr', 'mb', 'ck', 'qu', 'xh'];

// Letter pairs that are easy to visually mistype/misread as a different
// character when reading the domain off a screen or business card.
const VISUAL_CONFUSION_PAIRS: [string, string][] = [
    ['r', 'n'], // "rn" can read as "m"
    ['c', 'l'],
    ['v', 'w'],
];

// A modest, non-exhaustive list of commonly-cited examples where an
// English-looking word has a different, awkward, or unrelated meaning in
// another widely-spoken language — the kind of thing international
// branding guides flag. This is not a comprehensive linguistic audit of
// every language; treat it as a basic sanity check, not clearance.
const GLOBAL_SAFETY_FLAGS: { term: string; note: string }[] = [
    { term: 'gift', note: '"Gift" means poison in German' },
    { term: 'mist', note: '"Mist" is a vulgar term for manure in German' },
    { term: 'preservativo', note: '"Preservativo" means condom in Spanish/Portuguese/Italian, not a food preservative' },
    { term: 'preservatif', note: '"Préservatif" means condom in French, not a food preservative' },
    { term: 'pet', note: '"Pet" is informal slang for "fart" in French' },
    { term: 'kaka', note: '"Kaka" is a childish word for feces in several Scandinavian and Slavic languages' },
    { term: 'lager', note: 'Neutral in English/German, but "lag" can sound negative in tech-branding contexts' },
    { term: 'bimbo', note: '"Bimbo" is a well-known bread/bakery brand name in Latin America, unrelated to the English slang meaning' },
    { term: 'fart', note: '"Fart" means "speed" or "travel" in Scandinavian languages, but reads as vulgar English slang globally' },
    { term: 'slut', note: '"Slut" means "end" or "finish" in Swedish/Danish/Norwegian, but is vulgar in English' },
    { term: 'kiki', note: 'Can carry unrelated slang meanings in some regions — worth a quick check for your target market' },
];

/**
 * "Pass the radio test": how easily someone can spell the domain
 * correctly after hearing it read aloud once, plus a light-touch scan for
 * meanings in other major languages that could undercut a global brand.
 */
export function scorePhoneticClarity(label: string): PhoneticResult {
    const notes: string[] = [];
    let score = 78;
    const lower = label.toLowerCase();

    for (const cluster of AMBIGUOUS_CLUSTERS) {
        if (lower.includes(cluster)) {
            score -= 10;
            notes.push(`Contains "${cluster}", a spelling that's often guessed wrong when only heard spoken aloud`);
            break; // one penalty is enough to make the point without stacking
        }
    }

    const hasDigits = /\d/.test(label);
    const hasLetters = /[a-z]/i.test(label);
    if (hasDigits && hasLetters) {
        score -= 15;
        notes.push('Mixes letters and digits — ambiguous when spoken aloud (is "4" the digit or does it sound like "for"?)');
    }

    for (const [a, b] of VISUAL_CONFUSION_PAIRS) {
        if (lower.includes(a + b) || lower.includes(b + a)) {
            score -= 8;
            notes.push(`Contains "${a}${b}", which can visually misread as a different letter (e.g. "rn" looks like "m")`);
            break;
        }
    }

    const globalFlags = GLOBAL_SAFETY_FLAGS.filter((f) => lower.includes(f.term));
    for (const flag of globalFlags) {
        score -= 12;
        notes.push(`Global safety: ${flag.note}`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    return { score, notes };
}
