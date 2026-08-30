import { getFile } from '../github.js';
import { headerFixFor } from './registry.js';
import { submitPlans } from './submit.js';
import { FixNotApplicableError, type FixContext, type FixPlan, type FixResult, type FixableFinding } from './types.js';

interface VercelHeaderBlock { source: string; headers: Array<{ key: string; value: string }> }
interface VercelJson { headers?: VercelHeaderBlock[]; [key: string]: unknown }

const CATCH_ALL_SOURCE = '/(.*)';

interface PlanRepoContext {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
}

/**
 * Folds every missing-header finding into a single vercel.json edit. Each
 * header finding is a separate row in the report but they all patch the same
 * catch-all block, so planning them together is what keeps "fix all" to one
 * commit instead of seven conflicting ones.
 */
export async function planSecurityHeaders(ctx: PlanRepoContext, findings: FixableFinding[]): Promise<FixPlan> {
    const fixes = findings
        .map(finding => ({ finding, fix: headerFixFor(finding.title) }))
        .filter((entry): entry is { finding: FixableFinding; fix: NonNullable<ReturnType<typeof headerFixFor>> } => Boolean(entry.fix));

    if (!fixes.length) throw new FixNotApplicableError('No automatic fix is defined for this specific header finding.');

    const file = await getFile(ctx.token, ctx.owner, ctx.repo, 'vercel.json', ctx.defaultBranch);
    if (!file) {
        throw new FixNotApplicableError('No vercel.json found in this repo — automatic header fixes currently only support Vercel-style header config.');
    }

    let config: VercelJson;
    try {
        config = JSON.parse(file.content);
    } catch {
        throw new FixNotApplicableError('vercel.json exists but is not valid JSON, so it could not be safely edited.');
    }

    config.headers = config.headers || [];
    let block = config.headers.find(h => h.source === CATCH_ALL_SOURCE);
    if (!block) {
        block = { source: CATCH_ALL_SOURCE, headers: [] };
        config.headers.push(block);
    }
    for (const { fix } of fixes) {
        const existing = block.headers.find(h => h.key.toLowerCase() === fix.header.toLowerCase());
        if (existing) existing.value = fix.value;
        else block.headers.push({ key: fix.header, value: fix.value });
    }

    const headerNames = fixes.map(f => f.fix.header);
    return {
        edits: [{
            path: 'vercel.json',
            content: JSON.stringify(config, null, 2) + '\n',
            sha: file.sha,
            message: headerNames.length > 1
                ? `Add ${headerNames.length} security headers`
                : `Add ${headerNames[0]} security header`,
        }],
        summary: fixes.map(f => `- \`${f.fix.header}: ${f.fix.value}\` in \`vercel.json\``).join('\n'),
        branchHint: headerNames.length > 1 ? 'security-headers' : headerNames[0],
        title: headerNames.length > 1
            ? `Security fix: add ${headerNames.length} security headers`
            : `Security fix: add ${headerNames[0]} header`,
        findingTitles: fixes.map(f => f.finding.title),
    };
}

export async function fixSecurityHeader(ctx: FixContext): Promise<FixResult> {
    const plan = await planSecurityHeaders(ctx, [ctx.finding]);
    return submitPlans(ctx, [plan]);
}
