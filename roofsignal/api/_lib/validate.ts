export const clean = (value: unknown, maxLength = 500): string =>
    typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

export const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/** Accepts common US phone formats and normalises to E.164 (+1XXXXXXXXXX). */
export function normalizePhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
}

export function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
