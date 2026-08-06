/**
 * John's territory: a 30-mile radius around Bossier City / Shreveport, LA.
 * Every lead the generator drops, and every appointment pin on the map, is
 * checked against this so nothing outside the drivable radius shows up.
 */
export const TERRITORY_CENTER = { lat: 32.5205, lng: -93.7412 };
export const TERRITORY_RADIUS_MILES = 30;

const EARTH_RADIUS_MILES = 3958.8;

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const toRad = (deg: number): number => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(s));
}

export function isInTerritory(point: { lat: number; lng: number }): boolean {
    return milesBetween(TERRITORY_CENTER, point) <= TERRITORY_RADIUS_MILES;
}

/**
 * Real neighborhoods and small towns within the 30-mile radius, with their
 * approximate centers. Leads are scattered around these rather than placed
 * literally anywhere in the circle, so they read like an actual local
 * service area instead of random points on a map.
 */
export const NEIGHBORHOODS: Array<{ name: string; lat: number; lng: number }> = [
    { name: 'Shreveport — Downtown', lat: 32.5252, lng: -93.7502 },
    { name: 'Shreveport — South Highlands', lat: 32.4850, lng: -93.7480 },
    { name: 'Shreveport — Broadmoor', lat: 32.4900, lng: -93.7250 },
    { name: 'Shreveport — Cross Lake', lat: 32.5350, lng: -93.8100 },
    { name: 'Bossier City — Downtown', lat: 32.5152, lng: -93.7321 },
    { name: 'Bossier City — South Bossier', lat: 32.4450, lng: -93.6850 },
    { name: 'Haughton', lat: 32.5390, lng: -93.5029 },
    { name: 'Benton', lat: 32.7010, lng: -93.7382 },
    { name: 'Blanchard', lat: 32.5865, lng: -93.9021 },
    { name: 'Greenwood', lat: 32.4363, lng: -93.9843 },
    { name: 'Keithville', lat: 32.3210, lng: -93.8385 },
    { name: 'Stonewall', lat: 32.2801, lng: -93.8393 },
    { name: 'Elm Grove', lat: 32.5810, lng: -93.4790 },
    { name: 'Princeton', lat: 32.5810, lng: -93.5350 },
    { name: 'Plain Dealing', lat: 32.9032, lng: -93.6982 },
    { name: 'Minden', lat: 32.6154, lng: -93.2871 },
    { name: 'Mooringsport', lat: 32.6987, lng: -93.9868 },
    { name: 'Oil City', lat: 32.7462, lng: -93.9752 },
    { name: 'Belcher', lat: 32.7590, lng: -93.8210 },
    { name: 'Gilliam', lat: 32.8330, lng: -93.8940 },
];
