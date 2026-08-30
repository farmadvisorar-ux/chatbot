import { fixSecurityHeader, planSecurityHeaders } from './headerFixer.js';
import { fixOutdatedLibrary, planLibraryBumps } from './jsLibraryFixer.js';
import { fixMissingSecurityTxt, planSecurityTxt } from './securityTxtFixer.js';
import { submitPlans } from './submit.js';
import { FixNotApplicableError, type FixContext, type FixPlan, type FixResult, type FixableFinding } from './types.js';

export { FixNotApplicableError };
export type { FixContext, FixResult, FixableFinding };

/** Routes a finding to the fixer that knows how to patch it. Throws FixNotApplicableError if none applies. */
export async function applyFix(ctx: FixContext): Promise<FixResult> {
    switch (ctx.finding.checkId) {
        case 'security-headers':
            return fixSecurityHeader(ctx);
        case 'outdated-js-libraries':
            return fixOutdatedLibrary(ctx);
        case 'exposed-paths':
            return fixMissingSecurityTxt(ctx);
        default:
            throw new FixNotApplicableError('This finding type does not have an automatic fix yet.');
    }
}

export interface BatchFixContext {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
    findings: Array<FixableFinding & { id: string }>;
}

export interface BatchFixResult {
    prUrl: string;
    /** Ids of findings this PR actually resolves. */
    fixedIds: string[];
    /** Findings that could not be planned, with the reason to show the user. */
    skipped: Array<{ id: string; title: string; reason: string }>;
}

/**
 * Plans every fixable finding, then pushes the whole lot as one pull request.
 * Findings that share a file are merged into a single edit, and a finding that
 * can't be fixed against this particular repo is reported back as skipped
 * rather than sinking the entire batch.
 */
export async function applyFixes(ctx: BatchFixContext): Promise<BatchFixResult> {
    const byCheck = new Map<string, Array<FixableFinding & { id: string }>>();
    for (const finding of ctx.findings) {
        const group = byCheck.get(finding.checkId);
        if (group) group.push(finding);
        else byCheck.set(finding.checkId, [finding]);
    }

    const plans: FixPlan[] = [];
    const fixedIds: string[] = [];
    const skipped: BatchFixResult['skipped'] = [];

    const record = (group: Array<FixableFinding & { id: string }>, plan: FixPlan) => {
        plans.push(plan);
        // A planner may resolve only some of the group (e.g. one of two
        // libraries is actually an npm dependency); match on title so the
        // findings it skipped stay open rather than being marked fixed.
        const resolved = new Set(plan.findingTitles);
        const reasons = new Map((plan.unresolved ?? []).map(u => [u.title, u.reason]));
        for (const finding of group) {
            if (resolved.has(finding.title)) fixedIds.push(finding.id);
            else skipped.push({
                id: finding.id,
                title: finding.title,
                reason: reasons.get(finding.title) ?? 'No automatic fix applied for this finding.',
            });
        }
    };

    const skipGroup = (group: Array<FixableFinding & { id: string }>, err: unknown) => {
        const reason = err instanceof FixNotApplicableError ? err.message
            : err instanceof Error ? err.message : 'Could not plan a fix.';
        for (const finding of group) skipped.push({ id: finding.id, title: finding.title, reason });
    };

    for (const [checkId, group] of byCheck) {
        try {
            if (checkId === 'security-headers') {
                record(group, await planSecurityHeaders(ctx, group));
            } else if (checkId === 'outdated-js-libraries') {
                record(group, await planLibraryBumps(ctx, group));
            } else if (checkId === 'exposed-paths') {
                // security.txt creates one file; plan each finding separately.
                for (const finding of group) {
                    try {
                        record([finding], await planSecurityTxt(ctx, finding));
                    } catch (err) {
                        skipGroup([finding], err);
                    }
                }
            } else {
                skipGroup(group, new FixNotApplicableError('This finding type does not have an automatic fix yet.'));
            }
        } catch (err) {
            skipGroup(group, err);
        }
    }

    if (!plans.length) {
        throw new FixNotApplicableError(
            skipped[0]?.reason ?? 'None of these findings have an automatic fix for this repo.',
        );
    }

    const result = await submitPlans(ctx, plans, plans.length > 1 ? 'security-fixes' : undefined);
    return { prUrl: result.prUrl, fixedIds, skipped };
}
