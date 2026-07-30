const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;

export function normalizeDomain(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
}

export function isValidDomain(input: string): boolean {
    const domain = normalizeDomain(input);
    if (domain.length < 3 || domain.length > 253) return false;
    return DOMAIN_RE.test(domain);
}

// Known multi-part public suffixes we special-case so `co.uk`, `com.au`,
// etc. are treated as a single TLD rather than splitting on every dot.
const COMPOUND_TLDS = new Set([
    'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk',
    'com.au', 'net.au', 'org.au',
    'co.nz', 'co.jp', 'co.in', 'co.za',
    'com.br', 'com.mx', 'com.tr',
]);

export function extractTld(domain: string): string {
    const normalized = normalizeDomain(domain);
    const parts = normalized.split('.');
    if (parts.length >= 3) {
        const lastTwo = parts.slice(-2).join('.');
        if (COMPOUND_TLDS.has(lastTwo)) return lastTwo;
    }
    return parts[parts.length - 1] ?? '';
}

/** The registrable label before the TLD, e.g. `example` for `example.com`. */
export function rootLabel(domain: string): string {
    const normalized = normalizeDomain(domain);
    const tld = extractTld(normalized);
    return normalized.slice(0, normalized.length - tld.length - 1);
}
