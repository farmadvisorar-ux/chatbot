'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatUsd } from '@/lib/format';

interface Row {
    domain: string;
    midUsd?: number;
    lowUsd?: number;
    highUsd?: number;
    confidence?: string;
    tld_label?: string;
    keyword?: { keyword: string; tier: string } | null;
    linguisticScore?: number;
    error?: string;
    loading: boolean;
}

const PRESET_BATTLES = [
    { label: 'AI Brand TLDs', domains: ['hyperflow.ai', 'hyperflow.io', 'hyperflow.com'] },
    { label: 'Fintech Contenders', domains: ['paydash.com', 'quickvault.com', 'capitalflow.io'] },
    { label: 'Short 4L vs 5L', domains: ['koda.com', 'kodas.com', 'koda.io'] },
];

function CompareInner() {
    const searchParams = useSearchParams();
    const [inputs, setInputs] = useState<string[]>(['hyperflow.ai', 'hyperflow.com', 'hyperflow.io']);
    const [rows, setRows] = useState<Row[]>([]);

    useEffect(() => {
        const a = searchParams.get('a');
        if (a) {
            setInputs([a, '', '']);
        }
    }, [searchParams]);

    async function runCompare(presetDomains?: string[]) {
        const domains = (presetDomains ?? inputs).map((d) => d.trim().toLowerCase()).filter(Boolean);
        if (domains.length < 2) return;

        if (presetDomains) {
            setInputs(presetDomains);
        }

        setRows(domains.map((domain) => ({ domain, loading: true })));

        const results = await Promise.all(
            domains.map(async (domain) => {
                try {
                    const res = await fetch(`/api/valuate?domain=${encodeURIComponent(domain)}`);
                    const data = await res.json();
                    if (!res.ok) return { domain, error: data.error, loading: false };
                    const r = data.result;
                    return {
                        domain: r.domain,
                        midUsd: r.midUsd,
                        lowUsd: r.lowUsd,
                        highUsd: r.highUsd,
                        confidence: r.confidence,
                        tld_label: r.tld_label,
                        keyword: r.keyword,
                        linguisticScore: r.linguisticScore,
                        loading: false,
                    };
                } catch {
                    return { domain, error: 'Failed to fetch', loading: false };
                }
            }),
        );
        setRows(results);
    }

    const highestMid = Math.max(...rows.map((r) => r.midUsd ?? 0));

    return (
        <div className="mx-auto max-w-4xl space-y-8 py-4">
            <div className="text-center space-y-3">
                <span className="text-xs bg-brand-500/20 text-brand-300 font-mono font-bold px-3 py-1 rounded-full border border-brand-500/30">
                    HEAD-TO-HEAD BATTLE
                </span>
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                    Domain Valuation Showdown
                </h1>
                <p className="mt-2 text-slate-400 text-sm max-w-xl mx-auto">
                    Compare 2 to 4 domain assets side by side across estimated resale value, TLD authority, and linguistic strength.
                </p>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="text-slate-500 font-mono text-[11px]">Instant Battles:</span>
                {PRESET_BATTLES.map((b) => (
                    <button
                        key={b.label}
                        type="button"
                        onClick={() => runCompare(b.domains)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-mono text-[11px] hover:border-slate-700 transition-colors"
                    >
                        {b.label}
                    </button>
                ))}
            </div>

            {/* Form */}
            <div className="card space-y-4 p-6 sm:p-8">
                <div className="grid gap-3 sm:grid-cols-3">
                    {inputs.map((val, i) => (
                        <div key={i} className="relative">
                            <span className="absolute left-3 top-3.5 text-xs font-mono text-slate-500">#{i + 1}</span>
                            <input
                                className="input pl-8 font-mono text-sm"
                                placeholder={`domain${i + 1}.com`}
                                value={val}
                                onChange={(e) => setInputs((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                            />
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                    <button
                        type="button"
                        className="text-xs text-brand-400 hover:text-brand-300 font-mono font-semibold"
                        onClick={() => setInputs((prev) => [...prev, ''])}
                        disabled={inputs.length >= 4}
                    >
                        + Add 4th domain
                    </button>
                    <button type="button" className="btn-primary text-xs font-bold px-6 py-2.5" onClick={() => runCompare()}>
                        Compare Assets →
                    </button>
                </div>
            </div>

            {/* Results Table */}
            {rows.length > 0 && (
                <div className="card overflow-hidden p-6 sm:p-8 space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>📊</span> Head-to-Head Valuation Breakdown
                    </h2>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs sm:text-sm">
                            <thead className="border-b border-slate-800 text-slate-400 font-mono text-xs">
                                <tr>
                                    <th className="pb-3 pr-4">Domain</th>
                                    <th className="pb-3 pr-4">Fair Market Value</th>
                                    <th className="pb-3 pr-4">Expected Range</th>
                                    <th className="pb-3 pr-4">Confidence</th>
                                    <th className="pb-3 pr-4">Linguistic Score</th>
                                    <th className="pb-3">Deep Report</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.map((r) => {
                                    const isWinner = highestMid > 0 && r.midUsd === highestMid;
                                    return (
                                        <tr key={r.domain} className="hover:bg-slate-900/40 transition-colors">
                                            <td className="py-3.5 pr-4 font-bold text-white font-mono">
                                                <div className="flex items-center gap-2">
                                                    <span>{r.domain}</span>
                                                    {isWinner && (
                                                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono">
                                                            👑 LEADER
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {r.loading ? (
                                                <td colSpan={5} className="py-3.5 text-slate-500 font-mono">Calculating appraisal…</td>
                                            ) : r.error ? (
                                                <td colSpan={5} className="py-3.5 text-red-400 font-mono">{r.error}</td>
                                            ) : (
                                                <>
                                                    <td className="py-3.5 pr-4 font-mono font-black text-emerald-400 text-base">
                                                        {formatUsd(r.midUsd!)}
                                                    </td>
                                                    <td className="py-3.5 pr-4 font-mono text-slate-400 text-xs">
                                                        {formatUsd(r.lowUsd!)} – {formatUsd(r.highUsd!)}
                                                    </td>
                                                    <td className="py-3.5 pr-4 capitalize font-mono text-xs text-slate-300">
                                                        {r.confidence}
                                                    </td>
                                                    <td className="py-3.5 pr-4 font-mono text-xs text-slate-300">
                                                        {r.linguisticScore}/100
                                                    </td>
                                                    <td className="py-3.5">
                                                        <Link
                                                            href={`/valuation/${encodeURIComponent(r.domain)}`}
                                                            className="text-brand-400 hover:text-brand-300 font-mono text-xs font-semibold underline"
                                                        >
                                                            Full Report →
                                                        </Link>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ComparePage() {
    return (
        <Suspense>
            <CompareInner />
        </Suspense>
    );
}
