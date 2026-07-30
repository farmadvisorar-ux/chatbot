import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

let wordSet: Set<string> | null = null;

function loadWords(): Set<string> {
    if (wordSet) return wordSet;
    const filePath = path.join(dirname, '..', '..', 'data', 'wordlist.txt');
    const raw = fs.readFileSync(filePath, 'utf-8');
    wordSet = new Set(raw.split('\n').map((w) => w.trim()).filter(Boolean));
    return wordSet;
}

export function isDictionaryWord(word: string): boolean {
    if (word.length < 2) return false;
    return loadWords().has(word.toLowerCase());
}

export interface Segmentation {
    words: string[];
    /** Fraction (0-1) of the label's characters covered by real dictionary words. */
    coverage: number;
}

/**
 * Best-effort segmentation of a domain label into dictionary words, e.g.
 * "carinsurance" -> ["car", "insurance"]. Uses dynamic programming to
 * find the segmentation that covers the most characters with real words,
 * preferring fewer/longer words over many short fragments.
 */
export function segmentLabel(label: string): Segmentation {
    const n = label.length;
    if (n === 0) return { words: [], coverage: 0 };

    // best[i] = best segmentation of label[0..i)
    const best: { words: string[]; covered: number }[] = new Array(n + 1);
    best[0] = { words: [], covered: 0 };

    for (let i = 1; i <= n; i++) {
        let choice: { words: string[]; covered: number } = { words: [label.slice(0, i)], covered: 0 };
        // Fall back: whole prefix as a single (uncovered) "word" if nothing better found.
        for (let j = Math.max(0, i - 16); j < i; j++) {
            const prev = best[j];
            if (!prev) continue;
            const piece = label.slice(j, i);
            const isWord = piece.length >= 2 && isDictionaryWord(piece);
            const covered = prev.covered + (isWord ? piece.length : 0);
            const candidate = { words: [...prev.words, piece], covered };
            if (covered > choice.covered || (covered === choice.covered && candidate.words.length < choice.words.length)) {
                choice = candidate;
            }
        }
        best[i] = choice;
    }

    const finalResult = best[n]!;
    // Merge consecutive non-word fragments back together for a cleaner display.
    const merged: string[] = [];
    for (const piece of finalResult.words) {
        const prevPiece = merged[merged.length - 1];
        if (prevPiece && !isDictionaryWord(prevPiece) && !isDictionaryWord(piece)) {
            merged[merged.length - 1] = prevPiece + piece;
        } else {
            merged.push(piece);
        }
    }

    return { words: merged, coverage: finalResult.covered / n };
}
