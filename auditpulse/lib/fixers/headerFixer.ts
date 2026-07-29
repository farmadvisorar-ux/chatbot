import { getFile, getBranchSha, createBranch, putFile, createPullRequest } from '../github.js';
import { headerFixFor } from './registry.js';
import { FixNotApplicableError, type FixContext, type FixResult } from './types.js';

interface VercelHeaderBlock { source: string; headers: Array<{ key: string; value: string }> }
interface VercelJson { headers?: VercelHeaderBlock[]; [key: string]: unknown }

const CATCH_ALL_SOURCE = '/(.*)';

export async function fixSecurityHeader(ctx: FixContext): Promise<FixResult> {
    const fix = headerFixFor(ctx.finding.title);
    if (!fix) throw new FixNotApplicableError('No automatic fix is defined for this specific header finding.');

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
    const existing = block.headers.find(h => h.key.toLowerCase() === fix.header.toLowerCase());
    if (existing) existing.value = fix.value;
    else block.headers.push({ key: fix.header, value: fix.value });

    const branch = `auditpulse-fix/${fix.header.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const baseSha = await getBranchSha(ctx.token, ctx.owner, ctx.repo, ctx.defaultBranch);
    await createBranch(ctx.token, ctx.owner, ctx.repo, branch, baseSha);
    await putFile(ctx.token, ctx.owner, ctx.repo, {
        path: 'vercel.json',
        content: JSON.stringify(config, null, 2) + '\n',
        message: `Add ${fix.header} security header`,
        branch,
        sha: file.sha,
    });

    const pr = await createPullRequest(ctx.token, ctx.owner, ctx.repo, {
        title: `Security fix: add ${fix.header} header`,
        head: branch,
        base: ctx.defaultBranch,
        body: `Opened automatically by AuditPulse in response to this finding:\n\n> **${ctx.finding.title}**\n\nAdds \`${fix.header}: ${fix.value}\` to \`vercel.json\`. Review the value before merging — it's a safe conservative default, but you may want to tune it for your app.`,
    });
    return { prUrl: pr.url };
}
