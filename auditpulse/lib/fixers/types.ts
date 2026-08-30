export interface FixableFinding {
    checkId: string;
    title: string;
    evidence: string | null;
    affectedUrl: string | null;
}

export interface FixContext {
    token: string;
    owner: string;
    repo: string;
    defaultBranch: string;
    finding: FixableFinding;
}

export interface FixResult {
    prUrl: string;
}

/** A single file write that a fix wants to make. `sha` is the existing blob sha when updating an existing file, absent when creating one. */
export interface FileEdit {
    path: string;
    content: string;
    sha?: string;
    message: string;
}

/**
 * What a fixer intends to do, computed before anything is pushed. Splitting
 * "work out the edit" from "open the PR" is what lets several findings that
 * touch the same file (all seven security headers live in vercel.json) collapse
 * into one commit and one pull request instead of racing each other.
 */
export interface FixPlan {
    edits: FileEdit[];
    /** Markdown bullet(s) describing this plan's change, listed in the PR body. */
    summary: string;
    /** Used to name the branch when this plan is submitted on its own. */
    branchHint: string;
    /** PR title used when this plan is submitted on its own. */
    title: string;
    /** Titles of the findings this plan resolves. */
    findingTitles: string[];
    /** Extra caveat surfaced in the PR body (e.g. "run npm install after merging"). */
    note?: string;
    /**
     * Findings this planner considered but could not fix, with the specific
     * reason. Lets a partially-successful plan explain itself instead of
     * leaving the caller to guess why a finding stayed open.
     */
    unresolved?: Array<{ title: string; reason: string }>;
}

/** Thrown by a fixer when this specific repo doesn't have the expected file/stack — surfaced to the user as-is. */
export class FixNotApplicableError extends Error {}
