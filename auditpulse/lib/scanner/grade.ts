import type { Finding, Severity } from './types.js';

const PENALTY: Record<Severity, number> = { critical: 30, high: 15, medium: 8, low: 3, info: 0 };

export function computeScore(findings: Finding[]): number {
    const score = findings.reduce((total, f) => total - PENALTY[f.severity], 100);
    return Math.max(0, Math.min(100, score));
}

export function scoreToGrade(score: number): string {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 60) return 'D';
    return 'F';
}

export function summarizeBySeverity(findings: Finding[]): Record<Severity, number> {
    const summary: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) summary[f.severity] += 1;
    return summary;
}
