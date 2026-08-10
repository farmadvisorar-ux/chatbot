/**
 * Maps archived URLs to local file paths, mirroring the layout a browser
 * would expect if it served the site from disk (index.html for
 * directories, sanitized query strings, no illegal filesystem characters).
 */

// Path separators can appear only after percent-decoding (for example,
// "%2e%2e%2fsecret"). Keep every decoded URL segment inside one ZIP entry
// segment so an archived URL cannot escape its host directory.
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const MAX_SEGMENT_LEN = 200;

export function sanitizeSegment(segment: string): string {
    let decoded = segment;
    try {
        decoded = decodeURIComponent(segment);
    } catch {
        // Leave as-is if it isn't validly percent-encoded.
    }
    let clean = decoded.replace(ILLEGAL_CHARS, '_').trim();
    clean = clean.replace(/[. ]+$/, '');
    if (!clean) return '_';
    if (clean.length > MAX_SEGMENT_LEN) clean = clean.slice(0, MAX_SEGMENT_LEN);
    return clean;
}

/** Convert an archived URL into a relative file path (posix-style, always
 * starting with the host name). */
export function urlToFilepath(url: string): string {
    const parts = new URL(url);
    const host = sanitizeSegment(parts.hostname + (parts.port ? `:${parts.port}` : ''));
    const rawSegments = parts.pathname.split('/').filter(Boolean);
    const segments = rawSegments.map(sanitizeSegment);

    if (segments.length === 0) {
        segments.push('index.html');
    } else if (!segments[segments.length - 1].includes('.')) {
        segments.push('index.html');
    }

    const query = parts.search.replace(/^\?/, '');
    if (query) {
        const q = sanitizeSegment(query);
        const last = segments[segments.length - 1];
        const dot = last.lastIndexOf('.');
        if (dot > 0) {
            segments[segments.length - 1] = `${last.slice(0, dot)}@${q}${last.slice(dot)}`;
        } else {
            segments[segments.length - 1] = `${last}@${q}`;
        }
    }

    return [host, ...segments].join('/');
}
