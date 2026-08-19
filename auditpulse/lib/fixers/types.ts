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

/** Thrown by a fixer when this specific repo doesn't have the expected file/stack — surfaced to the user as-is. */
export class FixNotApplicableError extends Error {}
