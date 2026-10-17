'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatUsd, formatUsdExact } from '@/lib/format';

interface BulkResultItem {
    domain: string;
    tld: string;
    midUsd: number;
    lowUsd: number;
    highUsd: number;
    confidence: string;
    confidenceScore: number;
    linguisticScore: number;
    liquidityRating: string;
    liquidationFloor: number;
    recommendedBinPrice: number;
    leaseMonthly24: number;
    trademarkRisk: string;
    udrpRating: string;
    collisionDensityScore: number;
}

interface BulkRow {
    domain: string;
    result?: BulkResultItem;
    error?: string;
}

const RISK_BADGE: Record<string, string> = {
    severe: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    elevated: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    unknown: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const LIQUIDITY_BADGE: Record<string, string> = {
    'Ultra-Liquid': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    'High Liquidity': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    'Moderate Liquidity': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    'Niche / Illiquid': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function BulkPage() {
    const [text, setText] = useState('');
    const [rows, setRows] = useState<BulkRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    async function handleSubmit() {
        const domains = text
            .split(/[\n,]/)
            .map((d) => d.trim())
            .filter(Boolean);
        if (domains.length === 0) return;

        setLoading(true);
        setNotice(null);
        try {
            const res = await fetch('/api/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domains }),
            });
            const data = await res.json();
            if (!res.ok) {
                setNotice(data.error);
                setRows([]);
                return;
            }
            if (data.truncated) {
                setNotice(`Only the first ${data.maxBatch} domains were evaluated. Sign up for higher limits.`);
            }
            setRows(
                data.results.map((r: any) => ({
                    domain: r.domain,
                    result: r.result
                        ? {
                              domain: r.result.domain,
                              tld: r.result.tld,
                              midUsd: r.result.midUsd,
                              lowUsd: r.result.lowUsd,
                              highUsd: r.result.highUsd,
                              confidence: r.result.confidence,
                              confidenceScore: r.result.confidenceScore ?? 75,
                              linguisticScore: r.result.linguisticScore,
                              liquidityRating: r.result.liquidity?.rating ?? 'Moderate Liquidity',
                              liquidationFloor: r.result.channelPricing?.liquidationFloor ?? Math.round(r.result.midUsd * 0.25),
                              recommendedBinPrice: r.result.channelPricing?.recommendedBinPrice ?? r.result.midUsd,
                              leaseMonthly24: r.result.channelPricing?.leaseToOwn?.months24?.monthlyUsd ?? Math.round((r.result.midUsd * 1.15) / 24),
                              trademarkRisk: r.result.trademark?.riskLevel ?? 'low',
                              udrpRating: r.result.trademark?.udrpRating ?? 'Minimal Risk',
                              collisionDensityScore: r.result.alternativeTlds?.collisionDensityScore ?? 50,
                          }
                        : undefined,
                    error: r.error,
                })),
            );
        } finally {
            setLoading(false);
        }
    }

    const validResults = rows.map((r) => r.result).filter(Boolean) as BulkResultItem[];
    const totalMid = validResults.reduce((sum, r) => sum + r.midUsd, 0);
    const totalLiquidation = validResults.reduce((sum, r) => sum + r.liquidationFloor, 0);
    const totalBin = validResults.reduce((sum, r) => sum + r.recommendedBinPrice, 0);
    const totalMonthlyLease = validResults.reduce((sum, r) => sum + r.leaseMonthly24, 0);

    const avgLinguisticScore = validResults.length > 0
        ? Math.round(validResults.reduce((sum, r) => sum + r.linguisticScore, 0) / validResults.length)
        : 0;

    const cleanTrademarkCount = validResults.filter((r) => r.trademarkRisk === 'low' || r.trademarkRisk === 'unknown').length;

    function handleExportCsv() {
        if (validResults.length === 0) return;
        const headers = [
            'Domain',
            'TLD',
            'Linguistic Score',
            'Mid FMV USD',
            'Low USD',
            'High USD',
            'Liquidation Floor USD',
            'Recommended BIN USD',
            '24mo Lease Monthly USD',
            'Confidence Rating',
            'Confidence Score',
            'Liquidity Rating',
            'Trademark Risk',
            'UDRP Rating',
            'Collision Density %',
        ];

        const csvRows = validResults.map((r) => [
            `"${r.domain}"`,
            `"${r.tld}"`,
            r.linguisticScore,
            r.midUsd,
            r.lowUsd,
            r.highUsd,
            r.liquidationFloor,
            r.recommendedBinPrice,
            r.leaseMonthly24,
            `"${r.confidence}"`,
            r.confidenceScore,
            `"${r.liquidityRating}"`,
            `"${r.trademarkRisk}"`,
            `"${r.udrpRating}"`,
            r.collisionDensityScore,
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `domainiq-portfolio-valuation-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <div className="text-center">
                <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-3 py-1 rounded-full font-semibold uppercase tracking-wider">
                    Phase 4 Portfolio Engine
                </span>
                <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">Bulk Portfolio Valuation</h1>
                <p className="mt-2 text-slate-500 max-w-xl mx-auto">
                    Appraise entire domain portfolios in seconds. Includes multi-channel pricing, liquidation floors, charm BINs, and trademark screening.
                </p>
            </div>

            <div className="card space-y-4 p-6">
                <textarea
                    className="input h-36 font-mono text-sm leading-relaxed"
                    placeholder={'cloudflow.io\npayflow.com\nnexusai.tech\nexamplebrand.co'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-xs text-slate-400">
                        Paste up to 200 domains (one per line, space, or comma-separated).
                    </p>
                    <button type="button" className="btn-primary !px-5 !py-2 text-sm font-semibold" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Evaluating Portfolio…' : 'Appraise Entire Portfolio →'}
                    </button>
                </div>
                {notice && <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded border border-amber-200 dark:border-amber-800">{notice}</p>}
            </div>

            {validResults.length > 0 && (
                <div className="space-y-6">
                    {/* Executive Portfolio Dashboard */}
                    <div className="card p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                    Portfolio Financial Summary ({validResults.length} domains)
                                </h2>
                                <p className="text-xs text-slate-500">
                                    Consolidated financial analytics across secondary market sales channels.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleExportCsv}
                                className="btn-secondary !py-1.5 !px-3 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto"
                            >
                                <span>📥 Export CSV</span>
                            </button>
                        </div>

                        {/* 4 Main Value Channels */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Fair Market Value</span>
                                <p className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">{formatUsd(totalMid)}</p>
                                <span className="text-[11px] text-slate-400 block mt-1">Secondary market baseline</span>
                            </div>

                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Liquidation Cash Floor</span>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatUsd(totalLiquidation)}</p>
                                <span className="text-[11px] text-slate-400 block mt-1">Immediate 48h auction exit</span>
                            </div>

                            <div className="p-4 rounded-xl bg-brand-50/30 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-900/40">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 block">Retail Listed Catalog (BIN)</span>
                                <p className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">{formatUsd(totalBin)}</p>
                                <span className="text-[11px] text-slate-400 block mt-1">Recommended Dan/Afternic BIN</span>
                            </div>

                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Financed Monthly Cash Flow</span>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatUsdExact(totalMonthlyLease)}/mo</p>
                                <span className="text-[11px] text-slate-400 block mt-1">Projected 24mo lease payments</span>
                            </div>
                        </div>

                        {/* Secondary Stats */}
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-500">
                            <div>
                                Average Linguistic Score: <strong className="text-slate-800 dark:text-slate-200">{avgLinguisticScore}/100</strong>
                            </div>
                            <div>
                                Clean Trademark Clearance: <strong className="text-emerald-600 dark:text-emerald-400">{cleanTrademarkCount} / {validResults.length}</strong>
                            </div>
                            <div>
                                High Liquidity Assets: <strong className="text-slate-800 dark:text-slate-200">{validResults.filter((r) => r.liquidityRating === 'High Liquidity' || r.liquidityRating === 'Ultra-Liquid').length}</strong>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Portfolio Table */}
                    <div className="card p-6 overflow-hidden">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Evaluated Domains</h3>
                            <span className="text-xs text-slate-400">{validResults.length} records</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-slate-400 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="pb-3 pr-4">Domain</th>
                                        <th className="pb-3 pr-4">Fair Market Value</th>
                                        <th className="pb-3 pr-4">Liquidation Floor</th>
                                        <th className="pb-3 pr-4">Retail BIN</th>
                                        <th className="pb-3 pr-4">Lease (24m)</th>
                                        <th className="pb-3 pr-4">Liquidity</th>
                                        <th className="pb-3 pr-4">UDRP Risk</th>
                                        <th className="pb-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {rows.map((r) => (
                                        <tr key={r.domain} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                            <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-slate-100">
                                                <Link href={`/valuation/${encodeURIComponent(r.domain)}`} className="hover:text-brand-600 hover:underline">
                                                    {r.domain}
                                                </Link>
                                            </td>
                                            {r.result ? (
                                                <>
                                                    <td className="py-3 pr-4 font-bold text-brand-600 dark:text-brand-400">{formatUsd(r.result.midUsd)}</td>
                                                    <td className="py-3 pr-4 text-slate-500 font-medium">{formatUsd(r.result.liquidationFloor)}</td>
                                                    <td className="py-3 pr-4 font-semibold text-slate-800 dark:text-slate-200">{formatUsd(r.result.recommendedBinPrice)}</td>
                                                    <td className="py-3 pr-4 text-slate-500 text-xs">{formatUsdExact(r.result.leaseMonthly24)}/mo</td>
                                                    <td className="py-3 pr-4">
                                                        <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${LIQUIDITY_BADGE[r.result.liquidityRating] || 'bg-slate-100 text-slate-700'}`}>
                                                            {r.result.liquidityRating}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${RISK_BADGE[r.result.trademarkRisk] || 'bg-slate-100 text-slate-700'}`}>
                                                            {r.result.udrpRating}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 text-right">
                                                        <Link
                                                            href={`/valuation/${encodeURIComponent(r.domain)}`}
                                                            className="text-xs font-semibold text-brand-600 hover:underline"
                                                        >
                                                            Report →
                                                        </Link>
                                                    </td>
                                                </>
                                            ) : (
                                                <td colSpan={7} className="py-3 text-xs text-red-500 font-medium">{r.error ?? 'Valuation error'}</td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
