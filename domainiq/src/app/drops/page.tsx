'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getExpiringDrops, type ExpiringDropDomain } from '@/lib/valuation/drops';
import { formatUsd } from '@/lib/format';

const STATUS_BADGE: Record<string, string> = {
    'ending-today': 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
    'pending-delete': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
    'pre-release-auction': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800',
};

const STATUS_LABEL: Record<string, string> = {
    'ending-today': 'Ending Today',
    'pending-delete': 'Pending Delete',
    'pre-release-auction': 'Pre-Release Auction',
};

export default function DropsPage() {
    const drops = getExpiringDrops();
    const [statusFilter, setStatusFilter] = useState('all');
    const [tldFilter, setTldFilter] = useState('all');
    const [minValueFilter, setMinValueFilter] = useState(0);

    const filtered = drops.filter((d) => {
        if (statusFilter !== 'all' && d.dropStatus !== statusFilter) return false;
        if (tldFilter !== 'all' && d.tld !== tldFilter) return false;
        if (minValueFilter > 0 && d.midUsd < minValueFilter) return false;
        return true;
    });

    const totalPortfolioValue = filtered.reduce((sum, d) => sum + d.midUsd, 0);

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <div className="text-center">
                <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-3 py-1 rounded-full font-semibold uppercase tracking-wider">
                    Phase 4 Drop Hunter
                </span>
                <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">Expiring Domain Drop Radar</h1>
                <p className="mt-2 text-slate-500 max-w-xl mx-auto">
                    Live curated intelligence feed of high-equity expiring, pending delete, and pre-release domains with appraisal data and instant backorder links.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
                        {['all', 'ending-today', 'pending-delete', 'pre-release-auction'].map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStatusFilter(s)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    statusFilter === s
                                        ? 'bg-brand-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                            >
                                {s === 'all' ? 'All Drops' : STATUS_LABEL[s]}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span>TLD:</span>
                            <select
                                value={tldFilter}
                                onChange={(e) => setTldFilter(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-medium"
                            >
                                <option value="all">All Extensions</option>
                                <option value="com">.com</option>
                                <option value="ai">.ai</option>
                                <option value="io">.io</option>
                                <option value="co">.co</option>
                                <option value="org">.org</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span>Min Value:</span>
                            <select
                                value={minValueFilter}
                                onChange={(e) => setMinValueFilter(Number(e.target.value))}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-medium"
                            >
                                <option value="0">Any Value</option>
                                <option value="10000">$10,000+</option>
                                <option value="20000">$20,000+</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Showing <strong>{filtered.length}</strong> qualified drop opportunities</span>
                    <span>Total Drop Pool Value: <strong className="text-brand-600 dark:text-brand-400">{formatUsd(totalPortfolioValue)}</strong></span>
                </div>
            </div>

            {/* Drop Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((d) => (
                    <div
                        key={d.domain}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm hover:border-brand-500 transition-all flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[d.dropStatus]}`}>
                                    ⏱️ {d.timeRemaining}
                                </span>
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-600 dark:text-slate-300">
                                    {d.category}
                                </span>
                            </div>

                            <Link href={`/valuation/${encodeURIComponent(d.domain)}`} className="group block">
                                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 transition-colors">
                                    {d.domain}
                                </h3>
                            </Link>

                            <div className="mt-3 flex items-baseline gap-2">
                                <span className="text-2xl font-black text-brand-600 dark:text-brand-400">
                                    {formatUsd(d.midUsd)}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                    Floor: {formatUsd(d.liquidationFloor)}
                                </span>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-medium border border-emerald-200 dark:border-emerald-800">
                                    🏛️ {d.vintageYears}y Vintage
                                </span>
                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-medium">
                                    Score {d.linguisticScore}/100
                                </span>
                                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-medium border border-emerald-200 dark:border-emerald-800">
                                    ⚖️ Trademark Clean
                                </span>
                            </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                            <a
                                href={d.backorderUrl}
                                target="_blank"
                                rel="noopener noreferrer sponsored"
                                className="btn-primary !py-1.5 !px-3 text-xs font-bold flex-1 text-center"
                            >
                                🎯 Backorder / Catch ↗
                            </a>
                            <Link
                                href={`/valuation/${encodeURIComponent(d.domain)}`}
                                className="btn-secondary !py-1.5 !px-3 text-xs font-semibold"
                            >
                                Value →
                            </Link>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
