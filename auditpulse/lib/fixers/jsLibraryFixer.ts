import { getFile } from '../github.js';
import { libraryFixFor } from './registry.js';
import { submitPlans } from './submit.js';
import { FixNotApplicableError, type FixContext, type FixPlan, type FixResult, type FixableFinding } from './types.js';

interface PackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
}

interface PlanRepoContext {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
}

/** Folds every outdated-library finding into a single package.json edit. */
export async function planLibraryBumps(ctx: PlanRepoContext, findings: FixableFinding[]): Promise<FixPlan> {
    const candidates = findings
        .map(finding => ({ finding, fix: libraryFixFor(finding.title) }))
        .filter((entry): entry is { finding: FixableFinding; fix: NonNullable<ReturnType<typeof libraryFixFor>> } => Boolean(entry.fix));

    if (!candidates.length) throw new FixNotApplicableError('No automatic fix is defined for this library.');

    const file = await getFile(ctx.token, ctx.owner, ctx.repo, 'package.json', ctx.defaultBranch);
    if (!file) {
        throw new FixNotApplicableError('No package.json found in this repo — this library may be loaded from a CDN <script> tag rather than npm, which the auto-fixer can\'t safely edit.');
    }

    let pkg: PackageJson;
    try {
        pkg = JSON.parse(file.content);
    } catch {
        throw new FixNotApplicableError('package.json exists but is not valid JSON, so it could not be safely edited.');
    }

    const applied: typeof candidates = [];
    const unresolved: Array<{ title: string; reason: string }> = [];
    for (const entry of candidates) {
        const { packageName, minVersion } = entry.fix;
        const section = pkg.dependencies?.[packageName] ? 'dependencies'
            : pkg.devDependencies?.[packageName] ? 'devDependencies'
            : null;
        if (!section) {
            unresolved.push({
                title: entry.finding.title,
                reason: `"${packageName}" isn't listed as an npm dependency in this repo's package.json — it may be loaded from a CDN <script> tag, which the auto-fixer can't safely edit.`,
            });
            continue;
        }
        pkg[section] = { ...(pkg[section] as Record<string, string>), [packageName]: `^${minVersion}` };
        applied.push(entry);
    }

    if (!applied.length) {
        throw new FixNotApplicableError(unresolved[0].reason);
    }

    return {
        edits: [{
            path: 'package.json',
            content: JSON.stringify(pkg, null, 2) + '\n',
            sha: file.sha,
            message: applied.length > 1
                ? `Bump ${applied.length} dependencies past known vulnerabilities`
                : `Bump ${applied[0].fix.packageName} to ^${applied[0].fix.minVersion}`,
        }],
        summary: applied.map(a => `- \`${a.fix.packageName}\` → \`^${a.fix.minVersion}\` in \`package.json\``).join('\n'),
        branchHint: applied.length > 1 ? 'bump-dependencies' : `bump-${applied[0].fix.packageName}`,
        title: applied.length > 1
            ? `Security fix: bump ${applied.length} outdated dependencies`
            : `Security fix: bump ${applied[0].fix.packageName} to ${applied[0].fix.minVersion}+`,
        findingTitles: applied.map(a => a.finding.title),
        note: 'Run `npm install` (or your package manager\'s equivalent) after merging to refresh the lockfile — this PR only edits package.json.',
        unresolved,
    };
}

export async function fixOutdatedLibrary(ctx: FixContext): Promise<FixResult> {
    const plan = await planLibraryBumps(ctx, [ctx.finding]);
    return submitPlans(ctx, [plan]);
}
