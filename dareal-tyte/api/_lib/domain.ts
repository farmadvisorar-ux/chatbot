/**
 * Validation and formatting helpers shared by the recovery/deploy routes.
 * Kept dependency-free and side-effect-free so they're cheap to unit test.
 */

export class ValidationError extends Error {}

// One or more dot-separated labels (letters/digits/hyphens, no leading/
// trailing hyphen), ending in a TLD of at least two letters. Deliberately
// strict: the value gets interpolated into an archive.org URL path, so
// anything with a scheme, path, query string, or whitespace must be
// rejected rather than stripped.
const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(input: unknown): string {
    if (typeof input !== 'string' || !input.trim()) {
        throw new ValidationError('Domain name is required.');
    }
    let domain = input.trim().toLowerCase();
    domain = domain.replace(/^[a-z]+:\/\//, '');
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    domain = domain.replace(/^www\./, '');

    if (!HOSTNAME_RE.test(domain)) {
        throw new ValidationError(`"${input}" is not a valid domain name.`);
    }
    return domain;
}

const TIMESTAMP_RE = /^\d{1,14}$/;
const DEFAULT_TIMESTAMP = '20210101000000';

export function normalizeTimestamp(input: unknown): string {
    if (input === undefined || input === null || input === '') return DEFAULT_TIMESTAMP;
    if (typeof input !== 'string' || !TIMESTAMP_RE.test(input)) {
        throw new ValidationError('Timestamp must be a numeric string like "20210101000000".');
    }
    return input;
}

const PROJECT_ID_RE = /^[a-z0-9-]{1,100}$/;

export function normalizeProjectId(input: unknown): string {
    if (typeof input !== 'string' || !PROJECT_ID_RE.test(input)) {
        throw new ValidationError('projectId must contain only lowercase letters, digits, and hyphens.');
    }
    return input;
}

/** Vercel project names: lowercase alphanumeric + hyphens, <=100 chars, no leading/trailing hyphen. */
export function slugifyProjectName(domain: string, prefix = 'dareal'): string {
    const cleaned = domain
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const name = `${prefix}-${cleaned}`;
    return name.slice(0, 100).replace(/-+$/g, '');
}

export function archiveSnapshotUrl(domain: string, timestamp: string): string {
    return `https://web.archive.org/web/${timestamp}id_/https://${domain}`;
}
