import { pathExists } from '../github.js';
import { submitPlans } from './submit.js';
import { FixNotApplicableError, type FixContext, type FixPlan, type FixResult, type FixableFinding } from './types.js';

const CANDIDATE_STATIC_DIRS = ['public', 'static'];

interface PlanRepoContext {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
}

export async function planSecurityTxt(ctx: PlanRepoContext, finding: FixableFinding): Promise<FixPlan> {
    let staticDir: string | null = null;
    for (const dir of CANDIDATE_STATIC_DIRS) {
        if (await pathExists(ctx.token, ctx.owner, ctx.repo, dir, ctx.defaultBranch)) {
            staticDir = dir;
            break;
        }
    }
    if (!staticDir) {
        throw new FixNotApplicableError('Could not find a public/ or static/ directory in this repo to place security.txt in — add it manually instead.');
    }

    const path = `${staticDir}/.well-known/security.txt`;
    if (await pathExists(ctx.token, ctx.owner, ctx.repo, path, ctx.defaultBranch)) {
        throw new FixNotApplicableError('security.txt already exists in this repo — the live site may just need redeploying.');
    }

    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
    const contents = [
        `Contact: mailto:security@${ctx.owner}.example`,
        `Expires: ${expires}`,
        'Preferred-Languages: en',
        '',
    ].join('\n');

    return {
        edits: [{ path, content: contents, message: 'Add security.txt' }],
        summary: `- Added \`${path}\` per RFC 9116`,
        branchHint: 'security-txt',
        title: 'Security fix: publish security.txt',
        findingTitles: [finding.title],
        note: `Replace the placeholder contact email (\`security@${ctx.owner}.example\`) with a real address you monitor.`,
    };
}

export async function fixMissingSecurityTxt(ctx: FixContext): Promise<FixResult> {
    const plan = await planSecurityTxt(ctx, ctx.finding);
    return submitPlans(ctx, [plan]);
}
