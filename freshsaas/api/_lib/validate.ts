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

export const numberValue = (value: unknown): number =>
    Number.isFinite(Number(value)) ? Number(value) : 0;

export const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));
