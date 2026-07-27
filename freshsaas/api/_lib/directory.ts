import type pg from 'pg';

export type DirectoryCandidate = {
    name: string;
    tagline: string;
    description: string;
    url: string;
    category?: string;
    tags?: string[];
    source: string;
    sourceUrl?: string;
    score?: number;
    status?: 'live' | 'pending_review';
};

/**
 * Same product can surface on several sources and on repeated runs, so entries
 * are keyed on the normalized product name plus the registrable host. Host
 * alone would collapse unrelated products sharing a platform domain; name
 * alone would collapse genuinely different products with generic names.
 */
export function dedupKey(name: string, url: string): string {
    const normalizedName = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
    let host = '';
    try {
        host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        host = '';
    }
    return `${normalizedName}@${host}`;
}

const BANNED = /\b(porn|casino|xxx|escort|viagra|crypto\s*giveaway)\b/i;

/**
 * Rejects entries that would embarrass the directory if published unreviewed.
 * The ingest job publishes straight to live, so this is the only gate.
 */
export function isPublishable(candidate: DirectoryCandidate): boolean {
    if (!candidate.name || candidate.name.length > 120) return false;
    if (!candidate.tagline || candidate.tagline.length < 8) return false;
    if (BANNED.test(candidate.name) || BANNED.test(candidate.tagline)) return false;
    try {
        const parsed = new URL(candidate.url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    } catch {
        return false;
    }
    return true;
}

/**
 * Inserts publishable candidates, skipping any whose dedup_key already exists.
 * Returns how many rows were actually added.
 */
export async function insertCandidates(pool: pg.Pool, candidates: DirectoryCandidate[]): Promise<number> {
    let inserted = 0;
    for (const candidate of candidates) {
        if (!isPublishable(candidate)) continue;
        const result = await pool.query(
            `INSERT INTO directory_entries
               (dedup_key, name, tagline, description, url, category, tags, source, source_url, score, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (dedup_key) DO NOTHING
             RETURNING id`,
            [
                dedupKey(candidate.name, candidate.url),
                candidate.name.trim().slice(0, 120),
                candidate.tagline.trim().slice(0, 200),
                candidate.description.trim().slice(0, 2000),
                candidate.url.slice(0, 2048),
                (candidate.category || 'New launch').slice(0, 60),
                (candidate.tags || []).slice(0, 6).map(tag => tag.slice(0, 40)),
                candidate.source.slice(0, 60),
                candidate.sourceUrl?.slice(0, 2048) ?? null,
                Math.max(0, Math.round(candidate.score ?? 0)),
                candidate.status ?? 'live',
            ],
        );
        if (result.rows[0]) inserted += 1;
    }
    return inserted;
}
