import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const SCRIPT_RE = /<script\s[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
const LINK_RE = /<link\s[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/i;

function hasIntegrity(tag: string): boolean {
    return /\sintegrity\s*=\s*["']/i.test(tag);
}

export const subresourceIntegrityCheck: CheckDefinition = {
    id: 'subresource-integrity',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const base = new URL(ctx.targetUrl);
        const flagged = new Set<string>();

        for (const pageUrl of ctx.additionalPages.slice(0, 3)) {
            const res = await safeFetch(pageUrl, { timeoutMs: ctx.timeoutMs }).catch(() => null);
            if (!res) continue;
            const html = await res.text();

            for (const match of html.matchAll(SCRIPT_RE)) {
                const tag = match[0];
                let src: URL;
                try {
                    src = new URL(match[1], pageUrl);
                } catch {
                    continue;
                }
                if (src.hostname === base.hostname) continue; // only third-party scripts carry supply-chain risk here
                if (!hasIntegrity(tag)) flagged.add(src.toString());
                if (flagged.size >= 10) break;
            }
            for (const match of html.matchAll(LINK_RE)) {
                const tag = match[0];
                const hrefMatch = tag.match(HREF_RE);
                if (!hrefMatch) continue;
                let href: URL;
                try {
                    href = new URL(hrefMatch[1], pageUrl);
                } catch {
                    continue;
                }
                if (href.hostname === base.hostname) continue;
                if (!hasIntegrity(tag)) flagged.add(href.toString());
                if (flagged.size >= 10) break;
            }
        }

        if (flagged.size) {
            findings.push({
                checkId: 'subresource-integrity',
                title: `${flagged.size} third-party script/stylesheet(s) loaded without Subresource Integrity`,
                severity: 'medium',
                impact: 'If any of these third-party providers gets hacked or has its CDN compromised, the malicious code they serve would run directly on your site with full access to everything your visitors do there — logins, payment forms, everything.',
                description: 'These external <script>/<link> tags have no `integrity` attribute, so the browser cannot verify the file it downloads hasn\'t been tampered with at the source.',
                evidence: Array.from(flagged).slice(0, 8).join('\n'),
                remediation: 'Add an `integrity="sha384-…"` attribute (and `crossorigin="anonymous"`) to third-party <script>/<link> tags — most CDNs (e.g. cdnjs, jsDelivr) publish the correct hash alongside the file.',
                references: ['https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity'],
            });
        }

        return findings;
    },
};
