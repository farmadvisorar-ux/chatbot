const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function estimateSyllables(label: string): number {
    const matches = label.toLowerCase().match(/[aeiouy]+/g);
    return matches ? matches.length : 1;
}

function longestRepeatRun(label: string): number {
    let longest = 1;
    let current = 1;
    for (let i = 1; i < label.length; i++) {
        if (label[i] === label[i - 1]) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 1;
        }
    }
    return longest;
}

function longestConsonantRun(label: string): number {
    let longest = 0;
    let current = 0;
    for (const ch of label.toLowerCase()) {
        if (/[a-z]/.test(ch) && !VOWELS.has(ch)) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    }
    return longest;
}

export interface BrandabilityResult {
    score: number; // 0-100
    hasDigits: boolean;
    hasHyphens: boolean;
    syllables: number;
    notes: string[];
}

/**
 * Scores how easy a string is to say, spell over the phone, and remember —
 * independent of whether it's a real dictionary word. Real one-word/two-word
 * dictionary matches are scored separately and layered on top of this.
 */
export function scoreBrandability(label: string): BrandabilityResult {
    const notes: string[] = [];
    let score = 70;

    const hasDigits = /\d/.test(label);
    const hasHyphens = label.includes('-');

    if (hasDigits) {
        score -= 22;
        notes.push('Contains digits, which hurts memorability and verbal sharing');
    }
    if (hasHyphens) {
        score -= 18;
        notes.push('Contains hyphens, which hurts type-in traffic and trust');
    }

    const hyphenCount = (label.match(/-/g) ?? []).length;
    if (hyphenCount > 1) score -= 10;

    const vowelCount = [...label.toLowerCase()].filter((c) => VOWELS.has(c)).length;
    const letters = label.replace(/[^a-z]/gi, '');
    const vowelRatio = letters.length ? vowelCount / letters.length : 0;
    if (vowelRatio < 0.15) {
        score -= 15;
        notes.push('Very few vowels, likely hard to pronounce');
    } else if (vowelRatio > 0.15 && vowelRatio < 0.55) {
        score += 8;
    }

    const consonantRun = longestConsonantRun(label);
    if (consonantRun >= 4) {
        score -= 12;
        notes.push('Long consonant cluster makes it hard to pronounce');
    }

    const repeatRun = longestRepeatRun(label);
    if (repeatRun >= 3) {
        score -= 10;
        notes.push('Repeated characters reduce clarity');
    }

    const syllables = estimateSyllables(label);
    if (syllables <= 3) {
        score += 10;
    } else if (syllables >= 6) {
        score -= 12;
        notes.push('Long to pronounce (many syllables)');
    }

    if (label.length <= 6) {
        score += 6;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    return { score, hasDigits, hasHyphens, syllables, notes };
}

export function scoreLength(charCount: number): { score: number; note: string } {
    // Non-linear: short domains are disproportionately more valuable.
    if (charCount <= 3) return { score: 100, note: 'Extremely short (3 characters or fewer) — premium tier' };
    if (charCount <= 5) return { score: 92, note: 'Very short, highly sought-after length' };
    if (charCount <= 7) return { score: 80, note: 'Short and easy to remember' };
    if (charCount <= 10) return { score: 62, note: 'Average length' };
    if (charCount <= 14) return { score: 42, note: 'Somewhat long' };
    if (charCount <= 20) return { score: 24, note: 'Long — harder to brand and type' };
    return { score: 10, note: 'Very long — typically low resale demand' };
}
