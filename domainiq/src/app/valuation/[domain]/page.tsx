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
import PitchGenerator from '@/components/PitchGenerator';
import LeaseCalculatorWidget from '@/components/LeaseCalculatorWidget';

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
    severe: 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300 dark:border-red-800',
    elevated: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
    low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    unknown: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
};

const UDRP_RATING_STYLE: Record<string, string> = {
    'Critical UDRP Forfeiture Risk': 'bg-red-600 text-white',
    'Elevated Infringement Risk': 'bg-rose-500 text-white',
    'Caution (Generic Overlap)': 'bg-amber-500 text-white',
    'Minimal Risk': 'bg-emerald-600 text-white',
};

const CONTINUITY_CONFIG: Record<string, { label: string; badge: string; icon: string }> = {
    longstanding: {
        label: 'Longstanding Archive Vintage',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
        icon: '🟢',
    },
    established: {
        label: 'Established Archive History',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
        icon: '🏛️',
    },
    recent: {
        label: 'Recent Archive Record',
        badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
        icon: '📅',
    },
    'drop-risk': {
        label: 'Re-Registration / Drop Gap',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
        icon: '⚠️',
    },
    virgin: {
        label: 'Fresh / Virgin Slate',
        badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
        icon: '🆕',
    },
};

const EQUITY_TIER_STYLE: Record<string, string> = {
    'Elite Brand Authority': 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800',
    'Established Digital Asset': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    'Commercial Brand Equity': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
    'Emerging Clean Slate': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
};

const INDEXABILITY_STYLE: Record<string, string> = {
    Optimal: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    Standard: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
    Caution: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
};

const COLLISION_DENSITY_STYLE: Record<string, string> = {
    'High Commercial Density': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    'Moderate Extension Footprint': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
    'Open Brand Landscape': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
};

const BUYER_URGENCY_STYLE: Record<string, string> = {
    'High Priority': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    'Strategic / Medium': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
    'Opportunistic': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
};

export default async function ValuationPage({ params }: Props) {
    const domain = decodeURIComponent(params.domain);
    let result: import('@/lib/valuation/engine').ValuationResult | undefined;
    let error: string | undefined;

    try {
        const valReq = await performValuation(domain);
        result = valReq.result;
        error = valReq.error;
    } catch (err) {
        error = err instanceof Error ? err.message : 'Valuation service encountered an unexpected error.';
    }

    if (error || !result) {
        return (
            <div className="mx-auto max-w-xl text-center py-12">
                <h1 className="text-2xl font-bold">Couldn&apos;t evaluate that domain</h1>
                <p className="mt-2 text-slate-500">{error ?? 'Please check the domain name and try again.'}</p>
                <Link href="/" className="btn-primary mt-6 inline-flex">Try another domain</Link>
            </div>
        );
    }

    let session = null;
    let alreadySaved = false;
    try {
        session = await getSession();
        if (session && process.env.DATABASE_URL) {
            const { rows } = await getPool().query('SELECT 1 FROM watchlist WHERE user_id = $1 AND domain = $2', [session.id, result.domain]);
            alreadySaved = rows.length > 0;
        }
    } catch {
        // Safe fallback if database is unavailable
    }

    const assetGrade =
        result.midUsd >= 10000000
            ? { grade: 'AAA+ Apex Asset', blurb: 'Generational Category-Defining Asset', color: 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300' }
            : result.midUsd >= 1000000
            ? { grade: 'AAA Institutional', blurb: 'Seven-Figure Digital Real Estate', color: 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300' }
            : result.midUsd >= 100000
            ? { grade: 'AA Prime Commercial', blurb: 'High-Demand Enterprise Brand', color: 'border-blue-500/40 bg-blue-950/70 text-blue-300' }
            : result.midUsd >= 20000
            ? { grade: 'A Strategic Asset', blurb: 'Liquid Mid-Market Commercial', color: 'border-brand-500/40 bg-brand-950/70 text-brand-300' }
            : result.midUsd >= 5000
            ? { grade: 'B+ Investment Tier', blurb: 'High-Turnover Brandable', color: 'border-purple-500/40 bg-purple-950/70 text-purple-300' }
            : { grade: 'B Emerging Asset', blurb: 'Affordable Entry Opportunity', color: 'border-slate-600/40 bg-slate-900/70 text-slate-300' };

    return (
        <div className="mx-auto max-w-4xl space-y-10">
            {/* Hero Valuation Card */}
            <section className="card p-8 sm:p-10 text-center relative overflow-hidden border-brand-500/30 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/30">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400" />
                
                {/* Asset Grade Pill */}
                <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-mono font-bold shadow-sm backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="tracking-wide">GRADE: {assetGrade.grade}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400 font-sans font-normal">{assetGrade.blurb}</span>
                </div>

                <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Estimated Fair Market Value for</p>
                <h1 className="mt-1 text-3xl sm:text-5xl font-black tracking-tight text-white font-mono">{result.domain}</h1>

                {result.exactComp && (
                    <div className="mx-auto mt-4 max-w-md rounded-xl bg-emerald-950/50 border border-emerald-800/80 px-4 py-2.5 text-xs text-emerald-300 flex items-center justify-center gap-2 shadow-inner">
                        <span>📌</span>
                        <span>
                            Exact recorded sale: <strong>{formatUsdExact(result.exactComp.sale_price_usd)}</strong>
                            {result.exactComp.sale_year ? ` (${result.exactComp.sale_year})` : ''} · {result.exactComp.source_note}
                        </span>
                    </div>
                )}

                <div className="mt-6 text-5xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-brand-300 tracking-tight font-mono">
                    {formatUsd(result.midUsd)}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                    Expected Range: <strong className="text-slate-200">{formatUsd(result.lowUsd)}</strong> – <strong className="text-slate-200">{formatUsd(result.highUsd)}</strong>
                    <span className="ml-2 text-xs text-slate-500 font-mono">(&plusmn;{result.volatilityBandPercent}% Volatility Band)</span>
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
                    {result.trademark.riskLevel !== 'low' && result.trademark.riskLevel !== 'unknown' && (
                        <span className="label-pill px-3 py-1 font-semibold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300 dark:border-red-700">
                            ⚖️ {result.trademark.udrpRating.toUpperCase()} ({result.trademark.udrpRiskScore}/100)
                        </span>
                    )}
                    {result.archive?.firstSeenYear && (
                        <span className="label-pill px-3 py-1 font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700">
                            🏛️ {result.archive.archiveAgeYears ? `${result.archive.archiveAgeYears}y Wayback Vintage` : `First Seen ${result.archive.firstSeenYear}`}
                        </span>
                    )}
                </div>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    <SaveToWatchlistButton domain={result.domain} signedIn={Boolean(session)} initiallySaved={alreadySaved} />
                    <ShareButton domain={result.domain} priceLabel={`${formatUsd(result.lowUsd)}–${formatUsd(result.highUsd)}`} />
                    <Link href={`/valuation/${encodeURIComponent(result.domain)}/certificate`} className="btn-secondary">
                        📄 Certificate
                    </Link>
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

                {/* Interactive Financing & Lease-to-Own Modeling Widget */}
                <div className="mt-6">
                    <LeaseCalculatorWidget channelPricing={result.channelPricing} domain={result.domain} />
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

            {/* Due Diligence & Risk Radar (Phase 2 Intelligence) */}
            <section className="card p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span>Due Diligence &amp; Risk Radar</span>
                            <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 rounded-full font-semibold">
                                Live Risk Intelligence
                            </span>
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Deep inspection of historical web archives, trademark conflicts, UDRP forfeiture risk, and digital asset equity.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Archive status badge */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${CONTINUITY_CONFIG[result.archive?.historicalContinuity ?? 'virgin']?.badge || 'bg-slate-100 text-slate-700'}`}>
                            {CONTINUITY_CONFIG[result.archive?.historicalContinuity ?? 'virgin']?.icon} {CONTINUITY_CONFIG[result.archive?.historicalContinuity ?? 'virgin']?.label}
                        </span>

                        {/* UDRP risk badge */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${RISK_STYLE[result.trademark.riskLevel]}`}>
                            ⚖️ UDRP: {result.trademark.udrpRating} ({result.trademark.udrpRiskScore}/100)
                        </span>

                        {/* Equity tier badge */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${EQUITY_TIER_STYLE[result.seoEquity.equityTier] || 'bg-slate-100 text-slate-700'}`}>
                            🌐 {result.seoEquity.equityTier}
                        </span>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Panel 1: Wayback Machine Footprint */}
                    <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">🏛️</span>
                                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Web Archive Footprint</h3>
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Wayback CDX</span>
                            </div>

                            <div className="mt-4 space-y-3">
                                <div>
                                    <span className="text-xs text-slate-500 block">First Recorded Snapshot</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                            {result.archive?.firstSeenYear ? `${result.archive.firstSeenYear}` : 'No archive found'}
                                        </span>
                                        {result.archive?.archiveAgeYears && (
                                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                (~{result.archive.archiveAgeYears} yrs online)
                                            </span>
                                        )}
                                    </div>
                                    {result.archive?.firstSeenDate && (
                                        <span className="text-[11px] text-slate-400 block mt-0.5">
                                            Recorded {result.archive.firstSeenDate}
                                            {result.archive.lastSeenYear ? ` · Active to ${result.archive.lastSeenYear}` : ''}
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded border border-slate-200 dark:border-slate-700">
                                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Continuity</span>
                                        <strong className="text-slate-800 dark:text-slate-200 text-xs font-bold capitalize">
                                            {result.archive?.historicalContinuity ?? 'virgin'}
                                        </strong>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded border border-slate-200 dark:border-slate-700">
                                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Due Diligence</span>
                                        <strong className={`text-xs font-bold ${result.archive?.riskStatus === 'high-risk-drop' ? 'text-rose-600 dark:text-rose-400' : result.archive?.riskStatus === 'dormant-gap' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                            {result.archive?.riskStatus ? result.archive.riskStatus.replace('-', ' ') : 'virgin domain'}
                                        </strong>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                        {result.archive?.summary ?? 'No prior historical archive record captured on Wayback Machine.'}
                                    </p>
                                    {result.archive?.details && (
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                            {result.archive.details}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800">
                            <a
                                href={result.archive?.waybackUrl ?? `https://web.archive.org/web/*/${encodeURIComponent(result.domain)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 flex items-center justify-between group"
                            >
                                <span>Inspect snapshots on Wayback Machine</span>
                                <span className="group-hover:translate-x-0.5 transition-transform">↗</span>
                            </a>
                        </div>
                    </div>

                    {/* Panel 2: Trademark & UDRP Legal Scanner */}
                    <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">⚖️</span>
                                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Trademark &amp; UDRP Scanner</h3>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${UDRP_RATING_STYLE[result.trademark.udrpRating] || 'bg-slate-200 text-slate-800'}`}>
                                    {result.trademark.udrpRating}
                                </span>
                            </div>

                            <div className="mt-4 space-y-3">
                                <div>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">UDRP Bad-Faith Risk Index</span>
                                        <strong className="text-slate-900 dark:text-slate-100 font-bold">{result.trademark.udrpRiskScore}/100</strong>
                                    </div>
                                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${
                                                result.trademark.udrpRiskScore >= 70
                                                    ? 'bg-red-500'
                                                    : result.trademark.udrpRiskScore >= 40
                                                    ? 'bg-amber-500'
                                                    : result.trademark.udrpRiskScore >= 20
                                                    ? 'bg-blue-500'
                                                    : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${Math.max(4, result.trademark.udrpRiskScore)}%` }}
                                        />
                                    </div>
                                </div>

                                {result.trademark.matches.length > 0 ? (
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Potential Mark Conflicts ({result.trademark.matches.length})</span>
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                            {result.trademark.matches.map((m, idx) => (
                                                <div key={idx} className="rounded-lg bg-red-50 dark:bg-red-950/40 p-2.5 border border-red-200 dark:border-red-900/40 text-xs">
                                                    <div className="flex items-center justify-between font-bold text-red-800 dark:text-red-300">
                                                        <span>{m.mark}</span>
                                                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 bg-red-200 dark:bg-red-900 rounded">
                                                            {m.matchType}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-red-700 dark:text-red-300 text-[11px] leading-relaxed">
                                                        {m.note}
                                                    </p>
                                                    {m.category && (
                                                        <p className="mt-0.5 text-[10px] text-red-500 dark:text-red-400">Sector: {m.category}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300">
                                        <div className="font-bold flex items-center gap-1.5">
                                            <span>✓</span>
                                            <span>No Famous Marks Detected</span>
                                        </div>
                                        <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300/80 leading-relaxed">
                                            Clean clearance against high-frequency tech, finance, pharma, and global retail brands.
                                        </p>
                                    </div>
                                )}

                                <p className="text-[11px] text-slate-400 leading-normal">
                                    {result.trademark.disclaimer}
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 text-[11px]">Direct Legal Search:</span>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={result.trademark.links.usptoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-semibold text-[11px]"
                                    >
                                        USPTO ↗
                                    </a>
                                    <span className="text-slate-300 dark:text-slate-700">·</span>
                                    <a
                                        href={result.trademark.links.wipoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-semibold text-[11px]"
                                    >
                                        WIPO ↗
                                    </a>
                                    <span className="text-slate-300 dark:text-slate-700">·</span>
                                    <a
                                        href={result.trademark.links.euipoUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-semibold text-[11px]"
                                    >
                                        EUIPO ↗
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Panel 3: Digital Asset & SEO Authority */}
                    <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">🌐</span>
                                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Asset &amp; SEO Authority</h3>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${INDEXABILITY_STYLE[result.seoEquity.indexabilityStatus] || 'bg-slate-100 text-slate-700'}`}>
                                    {result.seoEquity.indexabilityStatus} Index
                                </span>
                            </div>

                            <div className="mt-4 space-y-3">
                                <div>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Domain Authority Composite</span>
                                        <strong className="text-slate-900 dark:text-slate-100 font-bold">{result.seoEquity.authorityScore}/100</strong>
                                    </div>
                                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-600"
                                            style={{ width: `${Math.max(4, result.seoEquity.authorityScore)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded border border-slate-200 dark:border-slate-700">
                                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Radio Test</span>
                                        <strong className="text-slate-800 dark:text-slate-200 font-bold text-sm block mt-0.5">
                                            {result.seoEquity.radioTestScore}/100
                                        </strong>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800/80 p-2.5 rounded border border-slate-200 dark:border-slate-700">
                                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Search Clarity</span>
                                        <strong className="text-slate-800 dark:text-slate-200 text-sm font-bold block mt-0.5">
                                            {result.seoEquity.brandSearchability}/100
                                        </strong>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                        {result.seoEquity.summary}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {result.seoEquity.details}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                            <span>Equity Category:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{result.seoEquity.equityTier}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Cross-Extension Intelligence & Collision Radar (Phase 3) */}
            <section className="card p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span>Cross-Extension Intelligence &amp; Collision Radar</span>
                            <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 rounded-full font-semibold">
                                Multi-TLD Intelligence
                            </span>
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Real-time resolution status and comparative market valuations across the core commercial extension ecosystem.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${COLLISION_DENSITY_STYLE[result.alternativeTlds.densityRating] || 'bg-slate-100 text-slate-700'}`}>
                            🎯 {result.alternativeTlds.collisionDensityScore}% Saturated — {result.alternativeTlds.densityRating}
                        </span>
                    </div>
                </div>

                {/* Rationale Callout Banner */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 mb-6 text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-3">
                    <span className="text-lg">💡</span>
                    <div>
                        <strong className="text-slate-900 dark:text-slate-100 block mb-0.5">Commercial Collision Analysis:</strong>
                        {result.alternativeTlds.strategicRationale}
                    </div>
                </div>

                {/* Comparative Extensions Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-slate-400 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="pb-3 pr-4">Extension</th>
                                <th className="pb-3 pr-4">Full Domain</th>
                                <th className="pb-3 pr-4">Resolution Status</th>
                                <th className="pb-3 pr-4">TLD Authority</th>
                                <th className="pb-3 pr-4">Estimated Value</th>
                                <th className="pb-3 pr-4">Multiplier vs Current</th>
                                <th className="pb-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {result.alternativeTlds.alternatives.map((alt) => (
                                <tr
                                    key={alt.tld}
                                    className={`transition-colors ${
                                        alt.isCurrent
                                            ? 'bg-brand-50/50 dark:bg-brand-950/30 font-semibold'
                                            : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/30'
                                    }`}
                                >
                                    <td className="py-3.5 pr-4 font-bold text-slate-900 dark:text-slate-100">
                                        .{alt.tld}
                                        {alt.isCurrent && (
                                            <span className="ml-2 text-[10px] bg-brand-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                                                Active
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3.5 pr-4 text-slate-800 dark:text-slate-200">
                                        {alt.domain}
                                    </td>
                                    <td className="py-3.5 pr-4">
                                        <span
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                alt.status === 'active-resolving'
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                            }`}
                                        >
                                            <span className={`h-1.5 w-1.5 rounded-full ${alt.status === 'active-resolving' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                            {alt.status === 'active-resolving' ? 'Registered & Resolving' : 'Available / Inactive'}
                                        </span>
                                    </td>
                                    <td className="py-3.5 pr-4 text-xs text-slate-500">
                                        {alt.authority}/100
                                    </td>
                                    <td className="py-3.5 pr-4 font-bold text-brand-600 dark:text-brand-400">
                                        {formatUsd(alt.estMidUsd)}
                                    </td>
                                    <td className="py-3.5 pr-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                                        &times;{alt.multiplierVsCurrent.toFixed(2)}
                                    </td>
                                    <td className="py-3.5 text-right">
                                        {alt.isCurrent ? (
                                            <span className="text-xs text-slate-400 font-medium">Selected</span>
                                        ) : alt.status === 'active-resolving' ? (
                                            <Link
                                                href={`/valuation/${encodeURIComponent(alt.domain)}`}
                                                className="btn-secondary !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                                            >
                                                Evaluate →
                                            </Link>
                                        ) : (
                                            <a
                                                href={alt.actionUrl}
                                                target="_blank"
                                                rel="noopener noreferrer sponsored"
                                                className="btn-primary !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                                            >
                                                Register ↗
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* B2B Outbound Lead Prospector & Pitch Generator (Phase 3) */}
            <section className="card p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span>B2B Outbound Lead Prospector</span>
                            <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 rounded-full font-semibold">
                                Buyer Targeting Engine
                            </span>
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            High-intent buyer segments, acquisition logic, and customized outbound cold sales pitches.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                            📡 Best Channel: {result.leadProspector.recommendedOutreachChannel}
                        </span>
                    </div>
                </div>

                <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Outbound Positioning Angle
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                        {result.leadProspector.outboundAngle}
                    </p>
                </div>

                {/* 3 Targeted Buyer Persona Cards */}
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Targeted Buyer Personas ({result.leadProspector.buyerProfiles.length})
                </h3>
                <div className="grid gap-4 sm:grid-cols-3 mb-8">
                    {result.leadProspector.buyerProfiles.map((bp) => (
                        <div
                            key={bp.title}
                            className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900/30 flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                        {bp.title}
                                    </h4>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${BUYER_URGENCY_STYLE[bp.urgency] || 'bg-slate-100 text-slate-700'}`}>
                                        {bp.urgency}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                    {bp.targetSegment}
                                </p>

                                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                        Acquisition Trigger:
                                    </span>
                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                        {bp.acquisitionRationale}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 block mb-1">
                                    Suggested Lead Search Queries:
                                </span>
                                <div className="space-y-1">
                                    {bp.suggestedSearchQueries.map((q, idx) => (
                                        <code
                                            key={idx}
                                            className="block text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300 select-all truncate"
                                            title={q}
                                        >
                                            {q}
                                        </code>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Interactive Cold Pitch Generator */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Ready-To-Send Outbound Cold Pitch Generator
                        </h3>
                        <span className="text-xs text-slate-500">
                            1-Click Personalization &amp; Copy
                        </span>
                    </div>
                    <PitchGenerator
                        templates={result.leadProspector.pitchTemplates}
                        domain={result.domain}
                    />
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
