import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERRITORY_CENTER, TERRITORY_RADIUS_MILES, NEIGHBORHOODS, milesBetween, isInTerritory } from '../api/_lib/geo.ts';

test('the territory center is in its own territory', () => {
    assert.ok(isInTerritory(TERRITORY_CENTER));
});

test('every seeded neighborhood is within the 30-mile radius', () => {
    for (const place of NEIGHBORHOODS) {
        const distance = milesBetween(TERRITORY_CENTER, place);
        assert.ok(
            distance <= TERRITORY_RADIUS_MILES,
            `${place.name} is ${distance.toFixed(1)} miles out — outside the ${TERRITORY_RADIUS_MILES}-mile territory`,
        );
    }
});

test('a point far outside Louisiana is rejected', () => {
    assert.equal(isInTerritory({ lat: 40.7128, lng: -74.006 }), false); // New York City
});

test('milesBetween is symmetric and zero for the same point', () => {
    const a = { lat: 32.5, lng: -93.7 };
    const b = { lat: 32.6, lng: -93.6 };
    assert.equal(milesBetween(a, a), 0);
    assert.equal(Math.round(milesBetween(a, b) * 1000), Math.round(milesBetween(b, a) * 1000));
});
