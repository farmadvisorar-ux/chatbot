import { fixSecurityHeader } from './headerFixer.js';
import { fixOutdatedLibrary } from './jsLibraryFixer.js';
import { fixMissingSecurityTxt } from './securityTxtFixer.js';
import { FixNotApplicableError, type FixContext, type FixResult } from './types.js';

export { FixNotApplicableError };
export type { FixContext, FixResult };

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
