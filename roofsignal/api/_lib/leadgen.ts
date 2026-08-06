import type pg from 'pg';
import { TERRITORY_CENTER, NEIGHBORHOODS, milesBetween, isInTerritory } from './geo.ts';
import { fetchStormEventsForCounty, scoreFromEvents, representativeEvent } from './stormData.ts';

/**
 * There is no real, verified homeowner data behind these leads — that would
 * mean compiling real people's names and phone numbers into an unsolicited
 * contact list, which this app won't do regardless of what's technically
 * fetchable (see roofsignal/README.md for the full reasoning). Storm scoring
 * is different: NOAA/NCEI's Storm Events Database is free, public, and
 * requires no account, so a lead's storm_score and the event referenced in
 * its follow-up texts and summary are drawn from `storm_events` — real
 * historical hail/wind/tornado/hurricane events for the lead's actual parish
 * — whenever the fetch script (scripts/fetch-storm-events.mjs) has been run
 * for that county. Falls back to a roof-age-only heuristic when it hasn't
 * (e.g. a brand new deployment before the first scheduled ingest).
 *
 * Two things are deliberate about the rest of the synthetic data:
 *  - Phone numbers use the 555-01XX block, reserved by the NANP specifically
 *    for fiction, so a generated lead can never ring an actual person.
 *  - Names are drawn from generic first/last-name pools, not tied to any
 *    real homeowner.
 */

const FIRST_NAMES = [
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Linda', 'Michael', 'Barbara',
    'David', 'Elizabeth', 'Charles', 'Jennifer', 'Joseph', 'Maria', 'Thomas', 'Susan',
    'Christopher', 'Margaret', 'Daniel', 'Dorothy', 'Kevin', 'Angela', 'Brian', 'Ashley',
    'Ronald', 'Brenda', 'Anthony', 'Emma', 'Larry', 'Olivia', 'Gary', 'Cynthia',
    'Willie', 'Deborah', 'Terry', 'Rachel', 'Dennis', 'Carolyn', 'Walter', 'Janet',
];
const LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson',
    'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson',
    'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen',
    'Hall', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Perez',
    'Bell', 'Guidry', 'Broussard', 'Boudreaux', 'Landry', 'Fontenot', 'Hebert',
];
const STREET_NAMES = [
    'Magnolia', 'Live Oak', 'Pine Ridge', 'Cypress', 'Red River', 'Bayou', 'Cedar',
    'Dogwood', 'Sweetgum', 'Sunset', 'Hillcrest', 'Meadowbrook', 'Twin Oaks', 'Camellia',
    'Azalea', 'Persimmon', 'Willow', 'Old Minden', 'Airline', 'Barksdale', 'Kings Highway',
];
const STREET_SUFFIXES = ['St', 'Ave', 'Dr', 'Ln', 'Rd', 'Ct', 'Blvd', 'Way'];

/**
 * Illustrative fallback storms — used only when a lead's county has no real
 * `storm_events` on file yet (see the module doc comment above). Once
 * scripts/fetch-storm-events.mjs has run, messaging.ts and summary.ts prefer
 * the actual linked NOAA event over this list. The dates and storm names
 * here are still factual; it's the assignment of a given lead's roof to one
 * of them that's a placeholder, not a claim about that specific address.
 */
export const STORM_EVENTS = [
    { name: 'Hurricane Laura', date: 'August 2020', kind: 'category 4 hurricane winds' },
    { name: 'Hurricane Delta', date: 'October 2020', kind: 'hurricane-force winds' },
    { name: 'the March 2022 hailstorm outbreak', date: 'March 2022', kind: 'large hail' },
    { name: 'the April 2023 severe thunderstorm outbreak', date: 'April 2023', kind: 'straight-line winds and hail' },
];

function pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]!;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type GeneratedLead = {
    name: string;
    phone: string;
    address: string;
    neighborhood: string;
    lat: number;
    lng: number;
    distanceMiles: number;
    roofAgeYears: number;
    stormScore: number;
    insuranceLikelihood: number;
    /** Real storm_events row this score/narrative came from, or null if none was on file for the county. */
    stormEventId: string | null;
};

/** Roof-age-only fallback, used when the lead's county has no real storm_events on file. */
function heuristicStormScore(roofAgeYears: number): number {
    const ageComponent = clamp(roofAgeYears * 2.4, 0, 65);
    const stormComponent = randomInt(0, 45);
    return Math.round(clamp(ageComponent * 0.4 + stormComponent, 5, 98));
}

/** Places a point near a neighborhood center, retrying until it's in territory. */
function scatterPoint(center: { lat: number; lng: number }): { lat: number; lng: number } {
    for (let attempt = 0; attempt < 8; attempt++) {
        // ~0.02 degrees of latitude is about 1.4 miles; longitude jitter is
        // slightly wider since a degree of longitude is shorter at this latitude.
        const point = {
            lat: center.lat + (Math.random() - 0.5) * 0.04,
            lng: center.lng + (Math.random() - 0.5) * 0.05,
        };
        if (isInTerritory(point)) return point;
    }
    return center;
}

/**
 * `pool` is optional so this stays usable in pure unit tests and in any
 * context without a database — it just falls back to the roof-age heuristic
 * (see heuristicStormScore above) instead of looking up real storm history.
 */
export async function generateLead(pool?: pg.Pool): Promise<GeneratedLead> {
    const neighborhood = pick(NEIGHBORHOODS);
    const point = scatterPoint(neighborhood);
    const distanceMiles = Math.round(milesBetween(TERRITORY_CENTER, point) * 10) / 10;

    const roofAgeYears = randomInt(4, 32);

    let stormScore: number;
    let stormEventId: string | null = null;
    const realEvents = pool ? await fetchStormEventsForCounty(pool, neighborhood.countyFips) : [];
    const realScore = scoreFromEvents(realEvents);
    if (realScore !== null) {
        // Blend in a little roof-age signal so two homes in the same county
        // with very different roof ages don't score identically off the same
        // parish-wide storm history.
        const ageComponent = clamp(roofAgeYears * 2.4, 0, 65);
        stormScore = Math.round(clamp(realScore * 0.8 + ageComponent * 0.2, 5, 98));
        stormEventId = representativeEvent(realEvents)?.id ?? null;
    } else {
        stormScore = heuristicStormScore(roofAgeYears);
    }
    const insuranceLikelihood = Math.round(clamp(stormScore * 0.7 + randomInt(0, 25), 5, 97));

    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const houseNumber = randomInt(100, 9999);
    const street = `${pick(STREET_NAMES)} ${pick(STREET_SUFFIXES)}`;
    const cityLabel = neighborhood.name.split(' — ')[0]!;

    return {
        name: `${first} ${last}`,
        // Reserved-for-fiction block (NANP 555-01XX) — never a real number.
        phone: `+131855501${String(randomInt(0, 99)).padStart(2, '0')}`,
        address: `${houseNumber} ${street}, ${cityLabel}, LA`,
        neighborhood: neighborhood.name,
        lat: point.lat,
        lng: point.lng,
        distanceMiles,
        roofAgeYears,
        stormScore,
        insuranceLikelihood,
        stormEventId,
    };
}

/**
 * Sequential rather than Promise.all: each lead with real storm data on file
 * makes one DB query, and the pool this runs against is capped at 3
 * connections (see api/_lib/db.ts) — a batch of up to 75 is an infrequent
 * daily/admin action, not a latency-sensitive path, so simple beats parallel.
 */
export async function generateDailyBatch(count: number, pool?: pg.Pool): Promise<GeneratedLead[]> {
    const batch: GeneratedLead[] = [];
    for (let i = 0; i < count; i++) batch.push(await generateLead(pool));
    return batch;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
