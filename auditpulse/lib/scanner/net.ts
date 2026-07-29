import { lookup } from 'node:dns/promises';

/**
 * Blocks the scan engine from being turned into an SSRF tool against the
 * hosting provider's internal network (cloud metadata endpoints, localhost,
 * RFC1918 ranges, etc). Every hostname the engine is about to contact — the
 * original target and every redirect hop — must pass this before we connect.
 */
function isPrivateIPv4(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
}

function isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
        const v4 = lower.split(':').pop();
        if (v4?.includes('.')) return isPrivateIPv4(v4);
    }
    return false;
}

export class DisallowedTargetError extends Error {
    constructor(hostname: string) {
        super(`"${hostname}" resolves to a non-public address and cannot be scanned.`);
        this.name = 'DisallowedTargetError';
    }
}

export async function assertPublicHost(hostname: string): Promise<void> {
    const lower = hostname.toLowerCase();
    if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
        throw new DisallowedTargetError(hostname);
    }
    let addresses: { address: string; family: number }[];
    try {
        addresses = await lookup(hostname, { all: true });
    } catch {
        throw new DisallowedTargetError(hostname);
    }
    if (!addresses.length) throw new DisallowedTargetError(hostname);
    for (const { address, family } of addresses) {
        if (family === 4 && isPrivateIPv4(address)) throw new DisallowedTargetError(hostname);
        if (family === 6 && isPrivateIPv6(address)) throw new DisallowedTargetError(hostname);
    }
}

export interface SafeFetchOptions {
    method?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRedirects?: number;
    maxBodyBytes?: number;
}

export interface SafeFetchResult {
    status: number;
    headers: Headers;
    url: string;
    text: () => Promise<string>;
}

/**
 * fetch() wrapper that re-validates the target of every redirect hop against
 * assertPublicHost before following it (plain `redirect: 'follow'` would let
 * a public URL 302 into an internal address and defeat the guard above), and
 * caps response size so a malicious/huge body can't exhaust function memory.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const timeoutMs = opts.timeoutMs ?? 6000;
    const maxRedirects = opts.maxRedirects ?? 5;
    const maxBodyBytes = opts.maxBodyBytes ?? 2_000_000;

    let currentUrl = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const parsed = new URL(currentUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new DisallowedTargetError(parsed.hostname);
        }
        await assertPublicHost(parsed.hostname);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
            response = await fetch(currentUrl, {
                method: opts.method ?? 'GET',
                headers: { 'User-Agent': 'AuditPulseBot/1.0 (+https://auditpulse.example.com/about-our-scanner)', ...opts.headers },
                redirect: 'manual',
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location || hop === maxRedirects) {
                return wrapResponse(response, currentUrl, maxBodyBytes);
            }
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        return wrapResponse(response, currentUrl, maxBodyBytes);
    }
    throw new Error('Too many redirects');
}

function wrapResponse(response: Response, finalUrl: string, maxBodyBytes: number): SafeFetchResult {
    return {
        status: response.status,
        headers: response.headers,
        url: finalUrl,
        text: async () => {
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer).slice(0, maxBodyBytes);
            return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        },
    };
}
