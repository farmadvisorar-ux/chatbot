import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

interface VulnRule { name: string; pattern: RegExp; belowVersion: string; parse: (v: string) => number[]; note: string }

function parseSemver(v: string): number[] {
    return v.split('.').map(part => Number(part.replace(/[^0-9]/g, '')) || 0);
}

function isBelow(actual: number[], floor: number[]): boolean {
    for (let i = 0; i < Math.max(actual.length, floor.length); i++) {
        const a = actual[i] ?? 0;
        const f = floor[i] ?? 0;
        if (a < f) return true;
        if (a > f) return false;
    }
    return false;
}

const RULES: VulnRule[] = [
    { name: 'jQuery', pattern: /jquery[.-](\d+\.\d+\.\d+)/i, belowVersion: '3.5.0', parse: parseSemver, note: 'versions before 3.5.0 have known XSS issues in jQuery.htmlPrefilter / DOM manipulation methods (CVE-2020-11022, CVE-2020-11023)' },
    { name: 'Bootstrap', pattern: /bootstrap[.-](\d+\.\d+\.\d+)/i, belowVersion: '4.3.1', parse: parseSemver, note: 'versions before 4.3.1 have known XSS issues in the tooltip/popover/affix data attributes (CVE-2019-8331)' },
    { name: 'AngularJS', pattern: /angular(?:js)?[.-](\d+\.\d+\.\d+)/i, belowVersion: '1.8.3', parse: parseSemver, note: 'AngularJS 1.x reached end-of-life in January 2022 and no longer receives security patches; all 1.x versions are considered outdated' },
    { name: 'Lodash', pattern: /lodash[.-](\d+\.\d+\.\d+)/i, belowVersion: '4.17.21', parse: parseSemver, note: 'versions before 4.17.21 have known prototype pollution issues (CVE-2020-8203, CVE-2021-23337)' },
    { name: 'Moment.js', pattern: /moment[.-](\d+\.\d+\.\d+)/i, belowVersion: '2.29.4', parse: parseSemver, note: 'versions before 2.29.4 have a known ReDoS issue (CVE-2022-31129); the library is also in maintenance mode with no new features' },
    { name: 'Handlebars', pattern: /handlebars[.-](\d+\.\d+\.\d+)/i, belowVersion: '4.7.7', parse: parseSemver, note: 'versions before 4.7.7 have known prototype pollution / RCE issues (CVE-2021-23369, CVE-2021-23383)' },
];

/**
 * Static, best-effort scan of <script src> filenames and inline version
 * comments on the homepage. Flags libraries by version string only — it does
 * not fetch or execute any script — so this is informational and always
 * worth a manual confirmation (a matched filename does not guarantee the
 * exact upstream file is unmodified).
 */
export const outdatedJsLibrariesCheck: CheckDefinition = {
    id: 'outdated-js-libraries',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const res = await safeFetch(ctx.targetUrl, { timeoutMs: ctx.timeoutMs });
        const body = await res.text();

        for (const rule of RULES) {
            const match = body.match(rule.pattern);
            if (!match) continue;
            const version = match[1];
            if (isBelow(rule.parse(version), rule.parse(rule.belowVersion))) {
                findings.push({
                    checkId: 'outdated-js-libraries',
                    title: `Potentially outdated ${rule.name} (${version}) in use`,
                    severity: 'medium',
                    description: `Detected ${rule.name} version ${version} referenced on the page; ${rule.note}. Verify manually — the filename may not reflect the actual served content.`,
                    evidence: match[0],
                    remediation: `Upgrade ${rule.name} to ${rule.belowVersion} or later.`,
                    references: ['https://snyk.io/vuln/'],
                    affectedUrl: res.url,
                });
            }
        }

        return findings;
    },
};
