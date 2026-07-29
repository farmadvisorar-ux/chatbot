import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const CANDIDATE_DIRS = ['/images/', '/img/', '/uploads/', '/assets/', '/files/', '/backup/', '/backups/', '/wp-content/uploads/', '/media/', '/documents/'];
const LISTING_MARKERS = [/<title>Index of \//i, /Index of \/[^<]*<\/h1>/i, /\[To Parent Directory\]/i];

export const directoryListingCheck: CheckDefinition = {
    id: 'directory-listing',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const base = ctx.targetUrl.replace(/\/$/, '');

        const results = await Promise.allSettled(
            CANDIDATE_DIRS.map(async dir => {
                const res = await safeFetch(base + dir, { timeoutMs: Math.min(ctx.timeoutMs, 4000) });
                return { dir, res };
            }),
        );

        for (const result of results) {
            if (result.status !== 'fulfilled') continue;
            const { dir, res } = result.value;
            if (res.status !== 200) continue;
            const body = await res.text().catch(() => '');
            if (!LISTING_MARKERS.some(marker => marker.test(body))) continue;

            findings.push({
                checkId: 'directory-listing',
                title: `Directory listing enabled at ${dir}`,
                severity: 'medium',
                impact: 'Anyone can browse every file in this folder like a file manager — including old backups, forgotten uploads, or files nobody meant to publish, without needing to guess a single filename.',
                description: `A GET request to ${dir} returned an auto-generated directory listing instead of a 403/404, exposing the full contents of this folder.`,
                remediation: 'Disable directory autoindexing in the web server config (`Options -Indexes` on Apache, remove `autoindex on;` on nginx), or add an index.html placeholder to the directory.',
                references: ['https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/01-Testing_Directory_Traversal_File_Include'],
                affectedUrl: base + dir,
            });
        }

        return findings;
    },
};
