import type { Metadata } from 'next';
import Link from 'next/link';
import { performValuation } from '@/lib/valuation-request';
import { getSession } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { formatUsd, formatUsdExact } from '@/lib/format';
import ScoreBar from '@/components/ScoreBar';
import SaveToWatchlistButton from '@/components/SaveToWatchlistButton';
import ShareButton from '@/components/ShareButton';
import AlternativeNames from '@/components/AlternativeNames';
import EmbedBadge from '@/components/EmbedBadge';
import AdSlot from '@/components/AdSlot';

export const dynamic = 'force-dynamic';

interface Props {
    params: { domain: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const domain = decodeURIComponent(params.domain);
    return {
        title: `${domain} valuation — DomainIQ`,
        description: `Free, explainable estimate of what ${domain} is worth, based on comparable sales and multi-factor scoring.`,
    };
}

const CONFIDENCE_STYLE: Record<string, string> = {
    high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
    medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
    low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
};

const LIQUIDITY_STYLE: Record<string, string> = {
    'Ultra-Liquid': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
    'High Liquidity': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-700',
    'Moderate Liquidity': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700',
    'Niche / Illiquid': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
};

const COMP_TIER_STYLE: Record<string, string> = {
    'high-relevance': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    'medium-relevance': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    'directional': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
};

const HEAT_STYLE: Record<string, string> = {
    high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const RISK_STYLE: Record<string, string> = {
    elevated: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    unknown: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export default async function ValuationPage({ params }: Props) {
    const domain = decodeURIComponent(params.domain);
    const { result, error } = await performValuation(domain);

    if (error || !result) {
        return (
            <div className="mx-auto max-w-xl text-center">
                <h1 className="text-2xl font-bold">Couldn&apos;t evaluate that domain</h1>
                <p className="mt-2 text-slate-500">{error}</p>
                <Link href="/" className="btn-primary mt-6 inline-flex">Try another domain</Link>
            </div>
        );
    }

    const session = await getSession();
    let alreadySaved = false;
    if (session) {
        const { rows } = await getPool().query('SELECT 1 FROM watchlist WHERE user_id = $1 AND domain = $2', [session.id, result.domain]);
        alreadySaved = rows.length > 0;
    }

    return (
        <div className="mx-auto max-w-4xl space-y-10">
            {/* Hero Valuation Card */}
            <section className="card p-8 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-500" />
                <p className="text-sm font-medium text-slate-500">Estimated Fair Market Value for</p>
                <h1 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight">{result.domain}</h1>

                {result.exactComp && (
                    <div className="mx-auto mt-4 max-w-md rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-2">
                        <span>📌</span>
                        <span>
                            Exact recorded sale: <strong>{formatUsdExact(result.exactComp.sale_price_usd)}</strong>
                            {result.exactComp.sale_year ? ` (${result.exactComp.sale_year})` : ''} · {result.exactComp.source_note}
                        </span>
                    </div>
                )}

                <div className="mt-6 text-5xl sm:text-6xl font-black text-brand-600 tracking-tight">
                    {formatUsd(result.midUsd)}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                    Expected Range: <strong className="text-slate-800 dark:text-slate-200">{formatUsd(result.lowUsd)}</strong> – <strong className="text-slate-800 dark:text-slate-200">{formatUsd(result.highUsd)}</strong>
                    <span className="ml-2 text-xs text-slate-400">(&plusmn;{result.volatilityBandPercent}% Volatility Band)</span>
                </p>

                {/* Trust & Liquidity Highlights */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <span className={`label-pill px-3 py-1 font-semibold ${CONFIDENCE_STYLE[result.confidence]}`}>
                        🛡️ {result.confidenceScore}% {result.confidence.toUpperCase()} CONFIDENCE
                    </span>
                    <span className={`label-pill px-3 py-1 font-semibold ${LIQUIDITY_STYLE[result.liquidity.rating]}`}>
                        ⚡ {result.liquidity.rating} ({result.liquidity.estimatedDaysToSell})
                    </span>
                    <span className={`label-pill px-3 py-1 ${HEAT_STYLE[result.vertical.heat]}`}>
                        {result.outboundFitScore}/10 Outbound Fit — {result.vertical.label}
                    </span>
                </div>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    <SaveToWatchlistButton domain={result.domain} signedIn={Boolean(session)} initiallySaved={alreadySaved} />
                    <ShareButton domain={result.domain} priceLabel={`${formatUsd(result.lowUsd)}–${formatUsd(result.highUsd)}`} />
                    <Link href={`/compare?a=${encodeURIComponent(result.domain)}`} className="btn-secondary">Compare</Link>
                    <a
                        href={`https://dan.com/buy-domain/${encodeURIComponent(result.domain)}`}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="btn-primary"
                    >
                        List domain for sale →
                    </a>
                </div>
            </section>

            {/* Multi-Channel Pricing Matrix (Phase 1) */}
            <section className="card p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <h2 className="text-xl font-bold">Multi-Channel Pricing Matrix</h2>
                    <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-3 py-1 rounded-full font-semibold">
                        4 Transaction Realities
                    </span>
                </div>
                <p className="mb-6 text-sm text-slate-500">
                    A domain has multiple values depending on transaction speed, buyer intent, and liquidity channel:
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Channel 1: Liquidation Floor */}
                    <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Liquidation Floor</span>
                                <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 font-semibold">48h Cash-Out</span>
                            </div>
                            <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">{formatUsd(result.channelPricing.liquidationFloor)}</p>
                            <p className="mt-1 text-xs text-slate-500">Min. Auction Reserve: <strong>{formatUsd(result.channelPricing.recommendedReserve)}</strong></p>
                            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                                Immediate wholesale exit via NameJet, GoDaddy no-reserve auctions, or portfolio liquidators. Speed over price.
                            </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-400">
                            Fastest exit · Maximum discount
                        </div>
                    </div>

                    {/* Channel 2: Wholesale Investor */}
                    <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Wholesale (B2B)</span>
                                <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 font-semibold">Investor Spread</span>
                            </div>
                            <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
                                {formatUsd(result.channelPricing.wholesale.lowUsd)}–{formatUsd(result.channelPricing.wholesale.highUsd)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">Typical Turnover: <strong>14–45 days</strong></p>
                            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                                Direct sale to other portfolio domain investors and brokers. Liquid secondary market value.
                            </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-400">
                            Broker / reseller transactions
                        </div>
                    </div>

                    {/* Channel 3: Retail Buy-It-Now (Featured) */}
                    <div className="rounded-xl border-2 border-brand-500 p-5 bg-brand-50/20 dark:bg-brand-950/20 shadow-md relative flex flex-col justify-between">
                        <div className="absolute -top-3 right-4 bg-brand-600 text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow">
                            Primary Target
                        </div>
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">Inbound Retail (BIN)</span>
                            </div>
                            <div className="mt-3 flex items-baseline gap-2">
                                <p className="text-2xl font-black text-brand-600 dark:text-brand-400">{formatUsd(result.channelPricing.recommendedBinPrice)}</p>
                                <span className="text-[11px] text-brand-700 dark:text-brand-300 font-bold bg-brand-100 dark:bg-brand-900/60 px-2 py-0.5 rounded">Charm Price</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                                Range: {formatUsd(result.channelPricing.inboundBin.lowUsd)}–{formatUsd(result.channelPricing.inboundBin.highUsd)}
                            </p>

                            {/* Lease-to-Own Financing Box */}
                            <div className="mt-3 rounded-lg bg-white dark:bg-slate-800/90 p-2.5 border border-brand-200 dark:border-brand-900/50 shadow-sm">
                                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                                    <span>Lease-To-Own (Financed)</span>
                                    <span className="text-[10px] font-normal text-brand-600">+10-22% spread</span>
                                </div>
                                <div className="mt-1.5 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                                    <div className="flex justify-between">
                                        <span>12 mo:</span>
                                        <strong className="text-slate-900 dark:text-slate-100">{formatUsdExact(result.channelPricing.leaseToOwn.months12.monthlyUsd)}/mo</strong>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>24 mo:</span>
                                        <strong className="text-slate-900 dark:text-slate-100">{formatUsdExact(result.channelPricing.leaseToOwn.months24.monthlyUsd)}/mo</strong>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>36 mo:</span>
                                        <strong className="text-slate-900 dark:text-slate-100">{formatUsdExact(result.channelPricing.leaseToOwn.months36.monthlyUsd)}/mo</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-brand-200 dark:border-brand-900/40 text-[11px] font-medium text-slate-500">
                            Recommended listed BIN on Dan / Afternic
                        </div>
                    </div>

                    {/* Channel 4: Outbound Target */}
                    <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Outbound Target</span>
                                <span className="text-[10px] bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 px-2 py-0.5 rounded font-bold">Fit {result.outboundFitScore}/10</span>
                            </div>
                            <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
                                {formatUsd(result.channelPricing.outboundTarget.lowUsd)}–{formatUsd(result.channelPricing.outboundTarget.highUsd)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">Target: <strong>Enterprise End-User</strong></p>
                            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                                Valuation achievable when proactively negotiating directly with well-capitalized corporations, competitors, or funded startups.
                            </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-400">
                            Maximum upside · 6–18mo cycle
                        </div>
                    </div>
                </div>
            </section>

            {/* Valuation Trust, Confidence & Liquidity Profile (Phase 1) */}
            <section className="card p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span>Valuation Trust &amp; Liquidity Profile</span>
                            <span className="text-xs font-normal text-slate-400">v2.0 Algorithmic Verification</span>
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Quantitative confidence score and secondary-market velocity metrics.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-xs uppercase font-semibold text-slate-400">Trust Rating</div>
                            <div className="text-2xl font-black text-brand-600">{result.confidenceScore}%</div>
                        </div>
                        <div className="h-11 w-11 rounded-full border-4 border-brand-500/30 flex items-center justify-center font-bold text-sm text-brand-600 bg-brand-50 dark:bg-brand-950">
                            {result.confidence.toUpperCase()[0]}
                        </div>
                    </div>
                </div>

                {/* Liquidity Profile Highlight */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-5 mb-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Market Liquidity:</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${LIQUIDITY_STYLE[result.liquidity.rating]}`}>
                                {result.liquidity.rating}
                            </span>
                        </div>
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            Est. Horizon: <strong className="text-slate-900 dark:text-slate-100">{result.liquidity.estimatedDaysToSell}</strong>
                            {' · '}
                            Turnover Velocity: <strong className="capitalize text-slate-900 dark:text-slate-100">{result.liquidity.turnoverVelocity}</strong>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {result.liquidity.rationale}
                    </p>
                </div>

                {/* 4-Factor Confidence Breakdown */}
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Confidence Breakdown Factors</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                    {result.confidenceFactors.map((cf) => (
                        <div key={cf.name} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900/30">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{cf.name}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                    cf.impact === 'positive'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : cf.impact === 'negative'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                    {cf.score}/100 ({Math.round(cf.weight * 100)}% weight)
                                </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500 leading-relaxed">{cf.description}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span>Valuation Spread Volatility Band: &plusmn;{result.volatilityBandPercent}%</span>
                    <span>Multi-factor algorithmic weighting verified</span>
                </div>
            </section>

            {/* Linguistic Breakdown Section */}
            <section className="card p-8">
                <h2 className="mb-6 text-xl font-bold">Linguistic &amp; Composition Breakdown</h2>
                <div className="space-y-5">
                    {result.factors.map((f) => (
                        <ScoreBar key={f.key} label={`${f.label} (${Math.round(f.weight * 100)}% weight)`} score={f.score} detail={f.detail} />
                    ))}
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Extension</p>
                        <p className="mt-1 font-semibold">.{result.tld} — authority {result.tld_authority}/100</p>
                        <p className="mt-1 text-sm text-slate-500">{result.tld_label}</p>
                        <p className="mt-1 text-sm text-slate-500">Price multiplier vs. equivalent .com: &times;{result.tld_multiplier.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Keyword demand</p>
                        {result.keyword ? (
                            <>
                                <p className="mt-1 font-semibold">
                                    &ldquo;{result.keyword.keyword}&rdquo; — Tier {result.keyword.tier}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Category: {result.keyword.category} &middot; &times;{result.keyword.multiplier.toFixed(1)} demand multiplier
                                </p>
                            </>
                        ) : (
                            <p className="mt-1 text-sm text-slate-500">No high-commercial-value keyword detected in this domain.</p>
                        )}
                    </div>
                    {result.age && (
                        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 sm:col-span-2">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Registration age</p>
                            {result.age.registered ? (
                                <p className="mt-1 text-sm text-slate-500">
                                    {result.age.ageYears ? `~${result.age.ageYears.toFixed(1)} years old` : 'Registered, age unavailable'}
                                    {result.age.registrationDate ? ` (registered ${new Date(result.age.registrationDate).toLocaleDateString()})` : ''}
                                </p>
                            ) : (
                                <p className="mt-1 text-sm text-slate-500">
                                    This domain doesn&apos;t appear to be currently registered — you may be able to register it directly for
                                    the standard annual fee instead of buying on the aftermarket.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* Trademark Section */}
            <section className="card p-8">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold">Trademark &amp; Legal Screening</h2>
                    <span className={`label-pill ${RISK_STYLE[result.trademark.riskLevel]}`}>
                        {result.trademark.riskLevel === 'unknown' ? 'Not fully checked' : result.trademark.riskLevel === 'elevated' ? 'Elevated risk' : 'Low risk'}
                    </span>
                </div>
                {result.trademark.matches.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                        {result.trademark.matches.map((m) => (
                            <li key={m.mark} className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                <strong>{m.mark}</strong> — {m.note}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-500">
                        {result.trademark.checked ? 'No matching marks found in the live USPTO search.' : 'Not flagged by the basic famous-mark check.'}
                    </p>
                )}
                <p className="mt-3 text-xs text-slate-400">
                    {result.trademark.checked ? 'Source: live USPTO search.' : 'Source: heuristic check only, no live database queried.'} {result.trademark.disclaimer}
                </p>
            </section>

            {/* Go-To-Market Section */}
            <section className="card p-8">
                <h2 className="mb-1 text-xl font-bold">Go-To-Market &amp; Buyer Targeting</h2>
                <p className="mb-4 text-sm text-slate-500">
                    Strategic targeting criteria based on industry category and commercial keyword patterns:
                </p>
                <div className="space-y-4 text-sm">
                    <div>
                        <p className="font-semibold">Target Buyer Profile</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-400">{result.gtm.buyerProfile}</p>
                    </div>
                    <div>
                        <p className="font-semibold">Pitch Angle</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-400">{result.gtm.pitchAngle}</p>
                    </div>
                    <div>
                        <p className="font-semibold">Key Prospecting Signals</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-400">
                            {result.gtm.targetSignals.map((s) => (
                                <li key={s}>{s}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {/* Comparable Sales Section (Phase 1 Overhaul) */}
            {result.comps.length > 0 && (
                <section className="card p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
                        <h2 className="text-xl font-bold">Comparable Sales Considered</h2>
                        <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full font-medium">
                            {result.comps.length} Verified Sales
                        </span>
                    </div>
                    <p className="mb-4 text-sm text-slate-500">
                        Weighted by extension, sector category, and character length. Comps contributed{' '}
                        <strong>{Math.round(result.compsWeight * 100)}%</strong> weight to the final estimate.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-400 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="pb-3 pr-4">Domain</th>
                                    <th className="pb-3 pr-4">Sale price</th>
                                    <th className="pb-3 pr-4">Year</th>
                                    <th className="pb-3 pr-4">Relevance</th>
                                    <th className="pb-3 pr-4">Match Reason</th>
                                    <th className="pb-3">Source</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {result.comps.map((c) => (
                                    <tr key={c.domain} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                        <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-slate-100">{c.domain}</td>
                                        <td className="py-3 pr-4 font-bold text-brand-600 dark:text-brand-400">{formatUsdExact(c.sale_price_usd)}</td>
                                        <td className="py-3 pr-4 text-slate-500">{c.sale_year ?? '—'}</td>
                                        <td className="py-3 pr-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${COMP_TIER_STYLE[c.compTier]}`}>
                                                {c.similarity}%
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                            {c.matchReason}
                                        </td>
                                        <td className="py-3 text-xs text-slate-400">{c.source_note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <AlternativeNames seed={result.rootLabel} />

            <EmbedBadge domain={result.domain} />

            <AdSlot />

            <p className="text-center text-xs text-slate-400">
                This is an algorithmic estimate for informational purposes, not a formal appraisal or a guarantee of sale
                price. Actual market value depends on buyer demand at the time of sale.{' '}
                <Link href="/how-it-works" className="underline">See full methodology</Link>.
            </p>
        </div>
    );
}
