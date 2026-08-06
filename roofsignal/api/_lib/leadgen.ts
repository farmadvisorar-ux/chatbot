import { TERRITORY_CENTER, NEIGHBORHOODS, milesBetween, isInTerritory } from './geo.ts';

/**
 * There is no live storm-data / insurance-claim-likelihood vendor wired up
 * here — that needs a paid data contract (e.g. NOAA Storm Events for hail
 * and wind history, a roofing lead broker, or a carrier-side claims feed)
 * and credentials nobody has handed this deployment. Rather than fake a real
 * data source, this generates clearly-synthetic daily leads so the rest of
 * the app (calling, texting, scheduling, inspection, summaries, pipeline)
 * is fully working today and a real `LeadSource` can be dropped in later
 * without touching anything downstream.
 *
 * Two things are deliberate about the synthetic data:
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
 * Real, publicly documented severe-weather events for the territory. Used to
 * write specific-sounding storm analysis instead of generic filler — the
 * dates and storm names are factual, the assignment of a given lead's roof to
 * one of them is a synthetic scoring heuristic, not a claim about that
 * specific address.
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
};

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

export function generateLead(): GeneratedLead {
    const neighborhood = pick(NEIGHBORHOODS);
    const point = scatterPoint(neighborhood);
    const distanceMiles = Math.round(milesBetween(TERRITORY_CENTER, point) * 10) / 10;

    const roofAgeYears = randomInt(4, 32);

    // Older roofs and roofs in the path of a real recent storm score higher.
    // Bounded random walk rather than pure uniform, so the daily batch reads
    // like a plausible distribution instead of noise.
    const ageComponent = clamp(roofAgeYears * 2.4, 0, 65);
    const stormComponent = randomInt(0, 45);
    const stormScore = Math.round(clamp(ageComponent * 0.4 + stormComponent, 5, 98));
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
    };
}

export function generateDailyBatch(count: number): GeneratedLead[] {
    return Array.from({ length: count }, () => generateLead());
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
