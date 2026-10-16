const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;

export function normalizeDomain(input: string): string {
    let clean = (input || '').trim().toLowerCase();

    // 1. If it looks like an email (e.g. "alex@stripe.com"), extract the domain part
    if (clean.includes('@')) {
        clean = clean.split('@').pop() || clean;
    }

    // 2. Strip protocols, ports, queries, and fragments
    clean = clean
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[?#].*$/, '') // strip query strings and hash anchors
        .replace(/\/.*$/, '') // strip path
        .replace(/:\d+$/, '') // strip port like :8080 or :3000
        .replace(/_+/g, '-') // convert underscores to hyphens (common typo)
        .replace(/\s+/g, '') // strip whitespace inside domain
        .replace(/\.{2,}/g, '.') // collapse multiple dots
        .replace(/^\.+/, '') // strip leading dots
        .replace(/\.+$/, '') // strip trailing dots
        .replace(/[^a-z0-9.-]/g, ''); // strip any illegal characters

    // 3. Handle degenerate or empty inputs
    if (!clean || clean === 'com' || clean === 'net' || clean === 'org' || clean === 'ai' || clean === 'io' || clean === 'co') {
        clean = 'domainiq.com';
    }

    // 4. If no dot (bare keyword), append .com
    if (!clean.includes('.')) {
        clean = `${clean}.com`;
    }

    // 5. Clean leading and trailing hyphens on labels
    clean = clean
        .split('.')
        .map((label) => label.replace(/^-+/, '').replace(/-+$/, ''))
        .filter(Boolean)
        .join('.');

    if (!clean || !clean.includes('.')) {
        clean = 'domainiq.com';
    }

    return clean;
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
