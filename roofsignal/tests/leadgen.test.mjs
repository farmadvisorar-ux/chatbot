import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLead, generateDailyBatch } from '../api/_lib/leadgen.ts';
import { isInTerritory, TERRITORY_RADIUS_MILES } from '../api/_lib/geo.ts';

test('generated leads always fall inside the 30-mile territory', () => {
    for (let i = 0; i < 200; i++) {
        const lead = generateLead();
        assert.ok(isInTerritory({ lat: lead.lat, lng: lead.lng }), `lead outside territory: ${JSON.stringify(lead)}`);
        assert.ok(lead.distanceMiles <= TERRITORY_RADIUS_MILES);
    }
});

test('generated phone numbers always use the NANP fiction-reserved 555-01XX block', () => {
    for (let i = 0; i < 50; i++) {
        const lead = generateLead();
        assert.match(lead.phone, /^\+131855501\d{2}$/);
    }
});

test('scores stay within their documented bounds', () => {
    for (let i = 0; i < 200; i++) {
        const lead = generateLead();
        assert.ok(lead.stormScore >= 0 && lead.stormScore <= 100);
        assert.ok(lead.insuranceLikelihood >= 0 && lead.insuranceLikelihood <= 100);
        assert.ok(lead.roofAgeYears >= 1 && lead.roofAgeYears <= 50);
    }
});

test('generateDailyBatch returns exactly the requested count', () => {
    assert.equal(generateDailyBatch(0).length, 0);
    assert.equal(generateDailyBatch(37).length, 37);
});
