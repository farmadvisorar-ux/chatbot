import { getFile, getBranchSha, createBranch, putFile, createPullRequest } from '../github.js';
import { libraryFixFor } from './registry.js';
import { FixNotApplicableError, type FixContext, type FixResult } from './types.js';

export async function fixOutdatedLibrary(ctx: FixContext): Promise<FixResult> {
    const fix = libraryFixFor(ctx.finding.title);
    if (!fix) throw new FixNotApplicableError('No automatic fix is defined for this library.');

    const file = await getFile(ctx.token, ctx.owner, ctx.repo, 'package.json', ctx.defaultBranch);
    if (!file) {
        throw new FixNotApplicableError('No package.json found in this repo — this library may be loaded from a CDN <script> tag rather than npm, which the auto-fixer can\'t safely edit.');
    }

    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; [key: string]: unknown };
    try {
        pkg = JSON.parse(file.content);
    } catch {
        throw new FixNotApplicableError('package.json exists but is not valid JSON, so it could not be safely edited.');
    }

    const section = pkg.dependencies?.[fix.packageName] ? 'dependencies' : pkg.devDependencies?.[fix.packageName] ? 'devDependencies' : null;
    if (!section) {
        throw new FixNotApplicableError(`"${fix.packageName}" isn't listed as an npm dependency in this repo's package.json.`);
    }

    pkg[section] = { ...(pkg[section] as Record<string, string>), [fix.packageName]: `^${fix.minVersion}` };

    const branch = `auditpulse-fix/bump-${fix.packageName}-${Date.now()}`;
    const baseSha = await getBranchSha(ctx.token, ctx.owner, ctx.repo, ctx.defaultBranch);
    await createBranch(ctx.token, ctx.owner, ctx.repo, branch, baseSha);
    await putFile(ctx.token, ctx.owner, ctx.repo, {
        path: 'package.json',
        content: JSON.stringify(pkg, null, 2) + '\n',
        message: `Bump ${fix.packageName} to ^${fix.minVersion}`,
        branch,
        sha: file.sha,
    });

    const pr = await createPullRequest(ctx.token, ctx.owner, ctx.repo, {
        title: `Security fix: bump ${fix.packageName} to ${fix.minVersion}+`,
        head: branch,
        base: ctx.defaultBranch,
        body: `Opened automatically by AuditPulse in response to this finding:\n\n> **${ctx.finding.title}**\n\nUpdates the \`${fix.packageName}\` version range in \`package.json\` to \`^${fix.minVersion}\`. **Run \`npm install\` (or your package manager's equivalent) after merging** to refresh the lockfile — this PR only edits package.json.`,
    });
    return { prUrl: pr.url };
}
