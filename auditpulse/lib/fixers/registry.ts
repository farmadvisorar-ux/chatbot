/**
 * Which findings the auto-fix feature can attempt, decided by check_id (and,
 * for security-headers, which specific header the title names — the check
 * emits several distinct findings under one check_id). This is an optimistic
 * "this finding TYPE is fixable in principle" flag set at scan time for the
 * dashboard's "Fix with PR" button; whether a fix can actually be applied to
 * a *specific* connected repo (does it have a vercel.json? a package.json
 * dependency to bump?) is only known at fix time — see lib/fixers/index.ts.
 */

export interface HeaderFix { header: string; value: string }

const HEADER_FIXES: Array<{ match: RegExp; fix: HeaderFix }> = [
    { match: /Missing HTTP Strict-Transport-Security/i, fix: { header: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' } },
    { match: /Missing Content-Security-Policy \(CSP\) header/i, fix: { header: 'Content-Security-Policy', value: "default-src 'self'" } },
    { match: /Missing X-Content-Type-Options/i, fix: { header: 'X-Content-Type-Options', value: 'nosniff' } },
    { match: /Missing clickjacking protection/i, fix: { header: 'X-Frame-Options', value: 'DENY' } },
    { match: /Missing Referrer-Policy/i, fix: { header: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' } },
    { match: /Missing Permissions-Policy/i, fix: { header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' } },
    { match: /Missing Cross-Origin-Opener-Policy/i, fix: { header: 'Cross-Origin-Opener-Policy', value: 'same-origin' } },
];

export function headerFixFor(title: string): HeaderFix | undefined {
    return HEADER_FIXES.find(f => f.match.test(title))?.fix;
}

export interface LibraryFix { packageName: string; minVersion: string }

const LIBRARY_FIXES: Array<{ match: RegExp; fix: LibraryFix }> = [
    { match: /jQuery/i, fix: { packageName: 'jquery', minVersion: '3.5.0' } },
    { match: /Bootstrap/i, fix: { packageName: 'bootstrap', minVersion: '4.3.1' } },
    { match: /AngularJS/i, fix: { packageName: 'angular', minVersion: '1.8.3' } },
    { match: /Lodash/i, fix: { packageName: 'lodash', minVersion: '4.17.21' } },
    { match: /Moment\.js/i, fix: { packageName: 'moment', minVersion: '2.29.4' } },
    { match: /Handlebars/i, fix: { packageName: 'handlebars', minVersion: '4.7.7' } },
];

export function libraryFixFor(title: string): LibraryFix | undefined {
    return LIBRARY_FIXES.find(f => f.match.test(title))?.fix;
}

/** Set on findings at scan-persist time — decides whether the dashboard shows a "Fix with PR" button at all. */
export function isAutoFixable(checkId: string, title: string): boolean {
    if (checkId === 'security-headers') return Boolean(headerFixFor(title));
    if (checkId === 'outdated-js-libraries') return Boolean(libraryFixFor(title));
    if (checkId === 'exposed-paths') return /No security\.txt published/i.test(title);
    return false;
}
