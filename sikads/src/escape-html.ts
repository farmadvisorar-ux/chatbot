const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };

export const escapeHtml = (value: unknown): string =>
    String(value).replace(/[&<>'"]/g, character => ENTITIES[character] || character);

/** Returns an http(s) URL safe for use in href, or null for anything else. */
export function safeHttpUrl(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > 2048) return null;
    try {
        const parsed = new URL(raw);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch {
        /* not a URL */
    }
    return null;
}
