export const clean = (value: unknown, maxLength = 500): string =>
    typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const validEmail = (value: string): boolean =>
    value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const validUrl = (value: string): boolean => {
    if (value.length > 2048) return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

export const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * Postgres raises 22P02 on a malformed uuid, which surfaces as a 500 rather
 * than the 404 the caller deserves. Route handlers that put a caller-supplied
 * id straight into a uuid column check it here first.
 */
export const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
