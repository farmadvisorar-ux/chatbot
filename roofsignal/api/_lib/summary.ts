import { STORM_EVENTS } from './leadgen.ts';

export type SummaryLead = {
    name: string;
    address: string;
    neighborhood: string;
    roofAgeYears: number;
    stormScore: number;
    insuranceLikelihood: number;
};

export type GeneratedSummary = {
    roofCondition: string;
    stormAnalysis: string;
    insuranceNotes: string;
    recommendation: string;
};

/**
 * Drafts the four summary sections from what's already on file for the lead
 * plus whatever the field notes say, so John edits a starting point in the
 * app rather than typing a report from scratch after every inspection.
 */
export function draftSummary(lead: SummaryLead, fieldNotes: string): GeneratedSummary {
    const conditionWord = lead.roofAgeYears >= 20 ? 'aged and showing wear consistent with'
        : lead.roofAgeYears >= 12 ? 'moderately worn for'
        : 'in relatively good condition for';

    const roofCondition = `This roof is approximately ${lead.roofAgeYears} years old and is ${conditionWord} `
        + `a home its age in the ${lead.neighborhood} area. `
        + (fieldNotes ? fieldNotes : 'Field notes from the on-site inspection will appear here.');

    const stormEvent = lead.stormScore >= 75 ? STORM_EVENTS[0]
        : lead.stormScore >= 55 ? STORM_EVENTS[1]
        : lead.stormScore >= 35 ? STORM_EVENTS[2]
        : STORM_EVENTS[3];
    const stormAnalysis = `Storm impact score: ${lead.stormScore}/100. Homes in this part of the territory were `
        + `in the path of ${stormEvent!.name} (${stormEvent!.date}), which brought ${stormEvent!.kind}. `
        + `Photos from this inspection should be checked against typical ${stormEvent!.kind} damage patterns: `
        + `granule loss, bruised or cracked shingles, and lifted or missing tabs.`;

    const insuranceNotes = `Estimated insurance-claim likelihood: ${lead.insuranceLikelihood}/100, based on roof age `
        + `and local storm exposure. Louisiana homeowner policies commonly carry a percentage-based wind/hail `
        + `deductible (often 1-5% of dwelling coverage) rather than a flat dollar amount — worth confirming with `
        + `the carrier before filing. This is not a claims determination; the homeowner's insurer makes the final call.`;

    const recommendation = lead.insuranceLikelihood >= 60
        ? 'Recommend the homeowner file a claim for a full inspection by their carrier\'s adjuster. Cypress can '
            + 'meet the adjuster on-site and provide these photos as supporting documentation.'
        : lead.roofAgeYears >= 18
            ? 'Roof is approaching the end of its typical service life. Recommend budgeting for replacement in the '
                + 'next 1-3 years even without a qualifying storm claim.'
            : 'No immediate action required. Recommend a follow-up inspection after the next significant storm, '
                + 'or in 12-18 months.';

    return { roofCondition, stormAnalysis, insuranceNotes, recommendation };
}

/** 30 days, per the spec — regenerating a summary mints a fresh token/expiry. */
export function shareExpiry(from: Date = new Date()): Date {
    return new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
}
