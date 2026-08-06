import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    severityWeight, scoreFromEvents, representativeEvent, describeEvent, isRoofRelevantEventType,
} from '../api/_lib/stormData.ts';

const hurricane = { eventType: 'Hurricane (Typhoon)', magnitude: null, eventDate: '2020-08-27' };
const bigHail = { eventType: 'Hail', magnitude: 2.5, eventDate: '2023-04-01' };
const smallHail = { eventType: 'Hail', magnitude: 0.75, eventDate: '2023-04-01' };
const strongWind = { eventType: 'Thunderstorm Wind', magnitude: 65, eventDate: '2022-03-01' }; // knots
const weakWind = { eventType: 'Thunderstorm Wind', magnitude: 41, eventDate: '2022-03-01' };

test('severity ordering makes physical sense', () => {
    // 2.5" hail already saturates the 0..1 scale, same as a hurricane —
    // both are >= the more moderate events, which is the property that matters.
    assert.ok(severityWeight(hurricane) >= severityWeight(bigHail));
    assert.ok(severityWeight(hurricane) > severityWeight(smallHail));
    assert.ok(severityWeight(bigHail) > severityWeight(smallHail));
    assert.ok(severityWeight(strongWind) > severityWeight(weakWind));
    assert.ok(severityWeight(strongWind) >= 0 && severityWeight(strongWind) <= 1);
});

test('isRoofRelevantEventType excludes unrelated NOAA event types', () => {
    assert.equal(isRoofRelevantEventType('Hail'), true);
    assert.equal(isRoofRelevantEventType('Tornado'), true);
    assert.equal(isRoofRelevantEventType('Excessive Heat'), false);
    assert.equal(isRoofRelevantEventType('Drought'), false);
});

test('scoreFromEvents returns null for an empty county history', () => {
    assert.equal(scoreFromEvents([]), null);
});

test('scoreFromEvents stays within 5..98 and rewards recent severe events', () => {
    const recent = scoreFromEvents([{ ...hurricane, eventDate: new Date().toISOString().slice(0, 10) }]);
    const old = scoreFromEvents([{ ...hurricane, eventDate: '1990-01-01' }]);
    assert.ok(recent >= 5 && recent <= 98);
    assert.ok(old >= 5 && old <= 98);
    assert.ok(recent > old, 'a recent hurricane should score higher than one from 1990');
});

test('representativeEvent picks the most severe, tie-broken by most recent', () => {
    const events = [smallHail, bigHail, weakWind];
    assert.deepEqual(representativeEvent(events), bigHail);
    assert.equal(representativeEvent([]), null);
});

test('describeEvent uses the correct unit per NOAA event type (inches for hail, knots+mph for wind)', () => {
    const hailLabel = describeEvent({ ...bigHail, id: '1', magnitudeType: null, countyFips: 17, countyName: 'Caddo', narrative: '' });
    assert.match(hailLabel, /2\.5 in/);
    assert.doesNotMatch(hailLabel, /mph/);

    const windLabel = describeEvent({ ...strongWind, id: '2', magnitudeType: 'EG', countyFips: 17, countyName: 'Caddo', narrative: '' });
    assert.match(windLabel, /65 kt/);
    assert.match(windLabel, /mph/);
});
