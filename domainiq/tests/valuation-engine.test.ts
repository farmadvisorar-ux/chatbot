import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDomain } from '../src/lib/valuation/engine';
import { classifyStructuralArchetype } from '../src/lib/valuation/structural-classifier';
import { computeEconomicArbitrage } from '../src/lib/valuation/economic-arbitrage';

test('Structural Classifier correctly identifies investor asset archetypes', () => {
    // 1L .com
    const arch1L = classifyStructuralArchetype('z', 'com');
    assert.equal(arch1L.key, 'APEX_1L_COM');
    assert.equal(arch1L.rarity, 'Generational Scarcity');
    assert.equal(arch1L.totalPossibleUniverse, 26);
    assert(arch1L.marketFloorUsd >= 10_000_000);

    // 2L .com
    const arch2L = classifyStructuralArchetype('ai', 'com');
    assert.equal(arch2L.key, 'APEX_2L_COM');
    assert.equal(arch2L.totalPossibleUniverse, 676);
    assert(arch2L.marketFloorUsd >= 500_000);

    // 3L .com
    const arch3L = classifyStructuralArchetype('nxs', 'com');
    assert.equal(arch3L.key, 'APEX_3L_COM');
    assert.equal(arch3L.totalPossibleUniverse, 17576);
    assert(arch3L.marketFloorUsd >= 30_000);

    // 4L CVCV .com
    const archCVCV = classifyStructuralArchetype('boba', 'com');
    assert.equal(archCVCV.key, '4L_CVCV_COM');
    assert(archCVCV.marketFloorUsd >= 15_000);

    // Single dictionary word apex
    const archApex = classifyStructuralArchetype('insurance', 'com');
    assert.equal(archApex.key, '1WORD_APEX_DICTIONARY');
    assert(archApex.marketFloorUsd >= 250_000);

    // 2-word power brandable
    const archPower = classifyStructuralArchetype('smartpay', 'com');
    assert.equal(archPower.key, '2WORD_POWER_BRANDABLE');

    // Hyphenated penalty
    const archHyphen = classifyStructuralArchetype('best-car-insurance', 'com');
    assert.equal(archHyphen.key, 'HYPHENATED_PENALTY');
    assert(archHyphen.structuralMultiplier < 0.5);
});

test('Economic Arbitrage accurately computes CAC savings and capitalized value', () => {
    // High-intent finance keyword
    const ecoFinance = computeEconomicArbitrage({
        label: 'insurance',
        tld: 'com',
        category: 'finance',
        isSingleWord: true,
        compositionScore: 100,
        charCount: 9,
    });

    assert(ecoFinance.estimatedCpcUsd >= 30.0);
    assert(ecoFinance.annualMarketingAvoidanceUsd > 50_000);
    assert(ecoFinance.capitalizedAssetValueUsd >= 500_000);
    assert.equal(ecoFinance.commercialIntentGrade, 'Tier-1 Institutional (High CPC)');
    assert(ecoFinance.conversionTrustLiftPercent >= 25);
});

test('Consensus Valuation Engine triangulates multi-model valuation correctly', async () => {
    // Test a liquid 3L .com
    const res3L = await evaluateDomain('nxs.com', {
        lookupAge: false,
        lookupArchive: false,
        checkTrademark: false,
    });

    assert.equal(res3L.domain, 'nxs.com');
    assert.equal(res3L.structuralArchetype.key, 'APEX_3L_COM');
    assert(res3L.midUsd >= 35_000, `Expected 3L .com to meet or exceed market floor, got ${res3L.midUsd}`);
    assert(res3L.triangulation.modelAgreementScore >= 50);
    assert(res3L.valuationLedger.length >= 2);
    assert.equal(res3L.liquidity.rating, 'Ultra-Liquid');
});

test('Consensus Valuation Engine correctly honors exact benchmark sales', async () => {
    const resExact = await evaluateDomain('voice.com', {
        lookupAge: false,
        lookupArchive: false,
        checkTrademark: false,
    });

    assert.equal(resExact.domain, 'voice.com');
    assert(resExact.exactComp !== null);
    assert.equal(resExact.exactComp?.sale_price_usd, 30_000_000);
    assert.equal(resExact.midUsd, 30_000_000);
    assert.equal(resExact.confidence, 'high');
});

test('Consensus Valuation Engine applies appropriate discipline to long-tail domains', async () => {
    const resLongTail = await evaluateDomain('affordablewebdesignco.com', {
        lookupAge: false,
        lookupArchive: false,
        checkTrademark: false,
    });

    assert(resLongTail.midUsd < 5_000, `Expected long-tail domain under $5,000, got ${resLongTail.midUsd}`);
    assert(resLongTail.lowUsd < resLongTail.midUsd);
    assert(resLongTail.highUsd > resLongTail.midUsd);
});
