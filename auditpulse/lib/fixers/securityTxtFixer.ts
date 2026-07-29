import { pathExists, getBranchSha, createBranch, putFile, createPullRequest } from '../github.js';
import { FixNotApplicableError, type FixContext, type FixResult } from './types.js';

const CANDIDATE_STATIC_DIRS = ['public', 'static'];

export async function fixMissingSecurityTxt(ctx: FixContext): Promise<FixResult> {
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

    const branch = `auditpulse-fix/security-txt-${Date.now()}`;
    const baseSha = await getBranchSha(ctx.token, ctx.owner, ctx.repo, ctx.defaultBranch);
    await createBranch(ctx.token, ctx.owner, ctx.repo, branch, baseSha);
    await putFile(ctx.token, ctx.owner, ctx.repo, {
        path,
        content: contents,
        message: 'Add security.txt',
        branch,
    });

    const pr = await createPullRequest(ctx.token, ctx.owner, ctx.repo, {
        title: 'Security fix: publish security.txt',
        head: branch,
        base: ctx.defaultBranch,
        body: `Opened automatically by AuditPulse in response to this finding:\n\n> **${ctx.finding.title}**\n\nAdds \`${path}\` per RFC 9116. **Replace the placeholder contact email** (\`security@${ctx.owner}.example\`) with a real address you monitor before merging.`,
    });
    return { prUrl: pr.url };
}
