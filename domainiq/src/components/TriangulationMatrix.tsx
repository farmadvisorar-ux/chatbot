'use client';

import { formatUsd } from '@/lib/format';
import type { TriangulationResult, StructuralArchetypeInfo, EconomicArbitrageResult } from '@/lib/valuation/engine';

interface Props {
    triangulation: TriangulationResult;
    structuralArchetype: StructuralArchetypeInfo;
    economicArbitrage: EconomicArbitrageResult;
    domain: string;
}

export default function TriangulationMatrix({ triangulation, structuralArchetype, economicArbitrage, domain }: Props) {
    const {
        structuralValueUsd = 0,
        compsValueUsd = null,
        economicValueUsd = 0,
        defensiveValueUsd = 0,
        consensusFmvUsd = 0,
        modelAgreementScore = 85,
        modelWeights = { structural: 0.70, comps: 0.15, economic: 0.15 },
    } = triangulation || {};


    return (
        <section className="card p-6 sm:p-8 bg-slate-900/60 border border-slate-800 relative overflow-hidden backdrop-blur-md">
            {/* Cyber background illumination */}
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-brand-950/80 border border-brand-800/80 text-brand-300 font-bold">
                            CVM-4 Triangulation Engine
                        </span>
                        <h2 className="text-xl font-bold tracking-tight text-white">
                            Quad-Model Consensus Valuation Matrix
                        </h2>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400">
                        Synthesizes structural asset scarcity, empirical comps regression, and capitalized search economics into an institutional consensus.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-slate-300">Convergence:</span>
                    <strong className="text-emerald-400">{modelAgreementScore}% Agreement</strong>
                </div>
            </div>

            {/* 4 Models Grid */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
                {/* Model 1: Structural Scarcity */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between hover:border-cyan-500/40 transition-colors">
                    <div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span>MODEL 1: STRUCTURAL</span>
                            <span className="text-cyan-400 font-bold">{Math.round(modelWeights.structural * 100)}% WT</span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-cyan-400 font-mono">
                            {formatUsd(structuralValueUsd)}
                        </p>
                        <span className="mt-1 inline-block text-[10px] uppercase font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                            {structuralArchetype.rarity}
                        </span>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                            {structuralArchetype.label}. Baseline scarcity floor: {formatUsd(structuralArchetype.marketFloorUsd)}.
                        </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
                        Universe: {structuralArchetype.totalPossibleUniverse ? `${structuralArchetype.totalPossibleUniverse.toLocaleString()} combinations` : 'High selectivity'}
                    </div>
                </div>

                {/* Model 2: Comps Regression */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between hover:border-blue-500/40 transition-colors">
                    <div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span>MODEL 2: COMPS KNN</span>
                            <span className="text-blue-400 font-bold">{Math.round(modelWeights.comps * 100)}% WT</span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-blue-400 font-mono">
                            {compsValueUsd !== null ? formatUsd(compsValueUsd) : 'Directional'}
                        </p>
                        <span className="mt-1 inline-block text-[10px] uppercase font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                            2026 Present-Value Calibrated
                        </span>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                            Multivariate regression over verified historical sales comps normalized for market cycle inflation.
                        </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
                        Time-decayed benchmark index
                    </div>
                </div>

                {/* Model 3: Economic Search Arbitrage */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between hover:border-emerald-500/40 transition-colors">
                    <div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span>MODEL 3: SEARCH CAC</span>
                            <span className="text-emerald-400 font-bold">{Math.round(modelWeights.economic * 100)}% WT</span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-emerald-400 font-mono">
                            {formatUsd(economicValueUsd)}
                        </p>
                        <span className="mt-1 inline-block text-[10px] uppercase font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                            {economicArbitrage.commercialIntentGrade}
                        </span>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                            Replaces ${economicArbitrage.annualMarketingAvoidanceUsd.toLocaleString()}/yr in paid Google Ads at ${economicArbitrage.estimatedCpcUsd.toFixed(2)} CPC.
                        </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
                        Cap Rate: 10.0% · +{economicArbitrage.conversionTrustLiftPercent}% conversion lift
                    </div>
                </div>

                {/* Model 4: Defensive Collision Leverage */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
                    <div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span>MODEL 4: DEFENSIVE</span>
                            <span className="text-amber-400 font-bold">LEVERAGE</span>
                        </div>
                        <p className="mt-2 text-2xl font-black text-amber-400 font-mono">
                            {defensiveValueUsd > 0 ? `+${formatUsd(defensiveValueUsd)}` : 'Neutral'}
                        </p>
                        <span className="mt-1 inline-block text-[10px] uppercase font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                            Corporate Upgrade Premium
                        </span>
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                            {defensiveValueUsd > 0
                                ? 'Unicorn upgrade motivation: operating brands on alternative TLDs create high acquisition pressure.'
                                : 'Open extension landscape with normal outbound acquisition dynamics.'}
                        </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
                        Strategic negotiation leverage
                    </div>
                </div>
            </div>

            {/* Triangulation Consensus Summary Banner */}
            <div className="mt-5 rounded-xl border border-brand-500/30 bg-gradient-to-r from-brand-950/40 via-indigo-950/40 to-slate-900/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-600/20 border border-brand-500/40 flex items-center justify-center text-xl shrink-0">
                        ⚖️
                    </div>
                    <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                            Reconciled Institutional Consensus Fair Market Value
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                                {formatUsd(consensusFmvUsd)}
                            </span>
                            <span className="text-xs text-slate-400">
                                for <strong>{domain}</strong>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="text-left sm:text-right">
                    <span className="text-[11px] text-slate-400 font-mono block">
                        Statistical Model Variance
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">
                        &plusmn;{triangulation.modelAgreementScore >= 80 ? 'Low Discrepancy' : 'Moderate Corridor'} ({triangulation.modelAgreementScore}% Confidence)
                    </span>
                </div>
            </div>
        </section>
    );
}
