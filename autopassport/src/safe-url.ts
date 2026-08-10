/**
 * Keep links rendered from database content on ordinary web protocols even if
 * a row was inserted outside the public submission API.
 */
export function safeHref(value: string): string {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? value : '#';
    } catch {
        return '#';
    }
}

/**
 * The production CSP only permits remote images over HTTPS. Returning an
 * empty source lets the UI show its built-in fallback for legacy/bad rows.
 */
export function safeImageSrc(value: string): string {
    try {
        return new URL(value).protocol === 'https:' ? value : '';
    } catch {
        return '';
    }
}
