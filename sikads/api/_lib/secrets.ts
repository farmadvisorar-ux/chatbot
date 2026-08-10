import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string compare for bearer secrets. Length still leaks (different
 * lengths return false after a same-length compare against itself), but the
 * content of a matching-length guess cannot be walked character by character.
 */
export function secretsEqual(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
        timingSafeEqual(a, a);
        return false;
    }
    return timingSafeEqual(a, b);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
    return UUID_RE.test(value);
}
