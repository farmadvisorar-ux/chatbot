import { getBranchSha, createBranch, putFile, createPullRequest } from '../github.js';
import { FixNotApplicableError, type FixPlan, type FixResult } from './types.js';

interface SubmitContext {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
}

/**
 * Pushes one or more plans as a single branch and a single pull request.
 * Every edit lands on the same branch, so a caller fixing seven headers gets
 * one reviewable PR rather than seven that all conflict on vercel.json.
 */
export async function submitPlans(ctx: SubmitContext, plans: FixPlan[], branchHint?: string): Promise<FixResult> {
    if (!plans.length) throw new FixNotApplicableError('There is nothing to fix.');

    const slug = (branchHint ?? plans[0].branchHint).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const branch = `auditpulse-fix/${slug}-${Date.now()}`;
    const baseSha = await getBranchSha(ctx.token, ctx.owner, ctx.repo, ctx.defaultBranch);
    await createBranch(ctx.token, ctx.owner, ctx.repo, branch, baseSha);

    for (const plan of plans) {
        for (const edit of plan.edits) {
            await putFile(ctx.token, ctx.owner, ctx.repo, {
                path: edit.path,
                content: edit.content,
                message: edit.message,
                branch,
                sha: edit.sha,
            });
        }
    }

    const titles = plans.flatMap(p => p.findingTitles);
    const notes = plans.map(p => p.note).filter((n): n is string => Boolean(n));
    const multi = titles.length > 1;

    const body = [
        `Opened automatically by AuditPulse in response to ${multi ? `${titles.length} findings` : 'this finding'}:`,
        '',
        ...titles.map(t => `> **${t}**`),
        '',
        '### What changed',
        '',
        ...plans.map(p => p.summary),
        '',
        ...(notes.length ? ['### Before you merge', '', ...notes.map(n => `- ${n}`), ''] : []),
        'Review the values before merging — they are conservative defaults, but you may want to tune them for your app.',
    ].join('\n');

    const pr = await createPullRequest(ctx.token, ctx.owner, ctx.repo, {
        title: plans.length === 1 ? plans[0].title : `Security fixes: resolve ${titles.length} AuditPulse findings`,
        head: branch,
        base: ctx.defaultBranch,
        body,
    });
    return { prUrl: pr.url };
}
