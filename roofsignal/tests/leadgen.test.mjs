import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLead, generateDailyBatch } from '../api/_lib/leadgen.ts';
import { isInTerritory, TERRITORY_RADIUS_MILES } from '../api/_lib/geo.ts';

// No pool is passed in any of these, so every lead exercises the fallback
// heuristic path (see leadgen.ts) rather than a real storm_events lookup —
// that path is covered separately in stormData.test.mjs.

test('generated leads always fall inside the 30-mile territory', async () => {
    for (let i = 0; i < 200; i++) {
        const lead = await generateLead();
        assert.ok(isInTerritory({ lat: lead.lat, lng: lead.lng }), `lead outside territory: ${JSON.stringify(lead)}`);
        assert.ok(lead.distanceMiles <= TERRITORY_RADIUS_MILES);
    }
});

test('generated phone numbers always use the NANP fiction-reserved 555-01XX block', async () => {
    for (let i = 0; i < 50; i++) {
        const lead = await generateLead();
        assert.match(lead.phone, /^\+131855501\d{2}$/);
    }
});

test('scores stay within their documented bounds, and no storm event is linked without a pool', async () => {
    for (let i = 0; i < 200; i++) {
        const lead = await generateLead();
        assert.ok(lead.stormScore >= 0 && lead.stormScore <= 100);
        assert.ok(lead.insuranceLikelihood >= 0 && lead.insuranceLikelihood <= 100);
        assert.ok(lead.roofAgeYears >= 1 && lead.roofAgeYears <= 50);
        assert.equal(lead.stormEventId, null);
    }
});

test('generateDailyBatch returns exactly the requested count', async () => {
    assert.equal((await generateDailyBatch(0)).length, 0);
    assert.equal((await generateDailyBatch(37)).length, 37);
});
