import { STORM_EVENTS } from './leadgen.ts';
import { describeEvent, type StormEvent } from './stormData.ts';

export type SummaryLead = {
    name: string;
    address: string;
    neighborhood: string;
    roofAgeYears: number;
    stormScore: number;
    insuranceLikelihood: number;
    /** The real NOAA event this lead's score was drawn from, if its parish had one on file. */
    stormEvent?: StormEvent | null;
};

export type GeneratedSummary = {
    roofCondition: string;
    stormAnalysis: string;
    insuranceNotes: string;
    recommendation: string;
};

/** NOAA carries a free-text narrative on many events; trimmed so it reads as an excerpt, not the raw record. */
function narrativeExcerpt(event: StormEvent): string {
    if (!event.narrative) return '';
    const trimmed = event.narrative.trim();
    return trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
}

function buildRealStormAnalysis(stormScore: number, event: StormEvent): string {
    const excerpt = narrativeExcerpt(event);
    return `Storm impact score: ${stormScore}/100, based on real NOAA storm history for this parish. `
        + `Nearest qualifying event on record: ${describeEvent(event)}. `
        + (excerpt ? `NOAA's report on this event: "${excerpt}" ` : '')
        + `Photos from this inspection should be checked against typical damage patterns for a ${event.eventType.toLowerCase()}: `
        + `granule loss, bruised or cracked shingles, and lifted or missing tabs.`;
}

/** Used only when the lead's parish has no real storm_events on file yet — see leadgen.ts. */
function buildFallbackStormAnalysis(stormScore: number): string {
    const event = stormScore >= 75 ? STORM_EVENTS[0]
        : stormScore >= 55 ? STORM_EVENTS[1]
        : stormScore >= 35 ? STORM_EVENTS[2]
        : STORM_EVENTS[3];
    return `Storm impact score: ${stormScore}/100. Homes in this part of the territory were `
        + `in the path of ${event!.name} (${event!.date}), which brought ${event!.kind}. `
        + `Photos from this inspection should be checked against typical ${event!.kind} damage patterns: `
        + `granule loss, bruised or cracked shingles, and lifted or missing tabs.`;
}

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

    const stormAnalysis = lead.stormEvent
        ? buildRealStormAnalysis(lead.stormScore, lead.stormEvent)
        : buildFallbackStormAnalysis(lead.stormScore);

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
