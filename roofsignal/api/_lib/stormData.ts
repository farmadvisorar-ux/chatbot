import type pg from 'pg';

/**
 * Real severe-weather history for the territory's parishes, sourced from
 * NOAA/NCEI's public Storm Events Database — see scripts/fetch-storm-events.mjs
 * for the ingest and db/schema.sql for storm_events. Everything in this file
 * is pure (no DB access except fetchStormEventsForCounty) so the scoring
 * logic is unit-testable without a database — see tests/stormData.test.mjs.
 */

export type StormEvent = {
    id: string;
    eventDate: string;
    eventType: string;
    magnitude: number | null;
    magnitudeType: string | null;
    countyFips: number;
    countyName: string;
    narrative: string;
};

/**
 * NOAA's Storm Events feed covers dozens of event types (heat, drought,
 * flood, etc.) that don't bear on a roof. This is the subset that does.
 */
const ROOF_RELEVANT_TYPES = new Set([
    'Hail', 'Marine Hail',
    'Thunderstorm Wind', 'Marine Thunderstorm Wind',
    'High Wind', 'Marine High Wind', 'Strong Wind', 'Marine Strong Wind',
    'Tornado',
    'Hurricane', 'Hurricane (Typhoon)', 'Tropical Storm', 'Tropical Depression',
]);

export function isRoofRelevantEventType(eventType: string): boolean {
    return ROOF_RELEVANT_TYPES.has(eventType);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * 0..1: how severe a real event is for roofing purposes. Hail and wind scale
 * with their actual reported magnitude; tornadoes and named storms get a
 * fixed high weight since this feed's numeric MAGNITUDE column doesn't carry
 * the F/EF scale (NOAA keeps that in a separate field this app doesn't
 * ingest). This is a heuristic ranking, not a damage assessment — it only
 * decides which real event is worth naming and how much it should move a
 * lead's score.
 *
 * Per NOAA/NWS's own format guide (NWSI 10-1605 §2.8), MAGNITUDE is inches
 * for hail and **knots** for wind — not mph, despite mph being the more
 * common way to talk about wind out loud. Getting this wrong would silently
 * understate every wind event's severity by ~15% (1 kt = 1.15 mph).
 */
export function severityWeight(event: Pick<StormEvent, 'eventType' | 'magnitude'>): number {
    const type = event.eventType.toLowerCase();
    if (type.includes('hurricane')) return 1;
    if (type.includes('tropical storm')) return 0.8;
    if (type.includes('tropical depression')) return 0.5;
    if (type.includes('tornado')) return 0.85;
    if (type.includes('hail')) {
        const inches = event.magnitude ?? 0.75;
        return clamp(inches / 2, 0.2, 1); // 2" hail (golf-ball+) -> max
    }
    if (type.includes('wind')) {
        // Severe-thunderstorm-warning criteria start at 50kt; 80kt+ is extreme.
        const knots = event.magnitude ?? 45;
        return clamp((knots - 40) / 40, 0.15, 1);
    }
    return 0.3;
}

/** Knots -> mph, for display only — NOAA's own narratives quote both (see describeEvent). */
function knotsToMph(knots: number): number {
    return Math.round(knots * 1.15078 * 10) / 10;
}

/**
 * 0..100, or null if the county has no real events on file yet (leadgen.ts
 * falls back to its roof-age heuristic in that case). Weighted by severity
 * and recency — a severe event a decade ago counts for less than a mild one
 * last year, roughly a 10-year fade.
 */
export function scoreFromEvents(events: StormEvent[], asOf: Date = new Date()): number | null {
    if (!events.length) return null;
    let total = 0;
    for (const event of events) {
        const daysAgo = (asOf.getTime() - new Date(event.eventDate).getTime()) / 86_400_000;
        const recency = clamp(1 - daysAgo / 3650, 0.1, 1);
        total += recency * severityWeight(event) * 45;
    }
    return Math.round(clamp(total, 5, 98));
}

/** The one event worth naming in a text/summary: most severe, then most recent. */
export function representativeEvent(events: StormEvent[]): StormEvent | null {
    if (!events.length) return null;
    return [...events].sort((a, b) => {
        const bySeverity = severityWeight(b) - severityWeight(a);
        if (bySeverity !== 0) return bySeverity;
        return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
    })[0]!;
}

const LOOKBACK_YEARS = 10;

/** Real events on file for one parish, most recent decade, roof-relevant types only (enforced at ingest). */
export async function fetchStormEventsForCounty(pool: pg.Pool, countyFips: number): Promise<StormEvent[]> {
    const { rows } = await pool.query<StormEvent>(
        `SELECT id, event_date AS "eventDate", event_type AS "eventType",
                magnitude::double precision AS magnitude, magnitude_type AS "magnitudeType",
                county_fips AS "countyFips", county_name AS "countyName", narrative
         FROM storm_events
         WHERE county_fips = $1 AND event_date > (CURRENT_DATE - ($2 || ' years')::interval)
         ORDER BY event_date DESC
         LIMIT 200`,
        [countyFips, LOOKBACK_YEARS],
    );
    return rows;
}

/** Fetches by id, for rendering a lead's already-linked event (messages, summaries). */
export async function fetchStormEventById(pool: pg.Pool, id: string): Promise<StormEvent | null> {
    const { rows } = await pool.query<StormEvent>(
        `SELECT id, event_date AS "eventDate", event_type AS "eventType",
                magnitude::double precision AS magnitude, magnitude_type AS "magnitudeType",
                county_fips AS "countyFips", county_name AS "countyName", narrative
         FROM storm_events WHERE id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

/** Human-readable label for a real event, e.g. "Hail (1.75 in) in Caddo Parish, Jun 12 2023". */
export function describeEvent(event: StormEvent): string {
    const date = new Date(event.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const type = event.eventType.toLowerCase();
    let magnitude = '';
    if (event.magnitude != null) {
        if (type.includes('hail')) {
            magnitude = ` (${event.magnitude} in)`;
        } else if (type.includes('wind')) {
            // Same "knots (mph)" convention NOAA's own generated narratives use.
            magnitude = ` (${event.magnitude} kt / ${knotsToMph(event.magnitude)} mph)`;
        }
    }
    return `${event.eventType}${magnitude} in ${event.countyName} Parish, ${date}`;
}
