const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };

export const escapeHtml = (value: unknown): string =>
    String(value).replace(/[&<>'"]/g, character => ENTITIES[character] || character);
