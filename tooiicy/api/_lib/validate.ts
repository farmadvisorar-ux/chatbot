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

/** UUIDs come back out of Postgres text columns and off the wire as strings; this is the one shape both must satisfy. */
export const isUuid = (value: unknown): value is string =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** A Printful sync variant id: a positive integer, sent to us as a number or a numeric string from an admin form. */
export const asPositiveInt = (value: unknown): number | null => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};
