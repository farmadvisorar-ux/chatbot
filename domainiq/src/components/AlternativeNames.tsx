'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatUsd } from '@/lib/format';

interface Suggestion {
    domain: string;
    midUsd: number;
    confidence: string;
    linguisticScore: number;
    registered: boolean | null;
}

export default function AlternativeNames({ seed }: { seed: string }) {
    const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seed }),
            });
            const data = await res.json();
            if (res.ok) {
                setSuggestions(data.suggestions);
            } else {
                setError(data.error ?? 'Could not generate alternatives right now.');
            }
        } catch {
            setError('Could not generate alternatives right now.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <section className="card p-6 sm:p-8 bg-slate-900/60 border border-slate-800 relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-cyan-950/60 border border-cyan-800/80 text-cyan-300">
                            AI Generator
                        </span>
                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-100">
                            Algorithmic Variations & Spin-offs
                        </h2>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400">
                        Deterministically blended variations with high commercial TLDs and brandable affixes for &ldquo;{seed}&rdquo;.
                    </p>
                </div>
                {!suggestions && (
                    <button
                        onClick={load}
                        disabled={loading}
                        className="btn-primary !py-2 !px-4 text-xs font-semibold whitespace-nowrap self-start sm:self-auto flex items-center gap-2 shadow-lg shadow-cyan-500/10"
                    >
                        {loading ? (
                            <>
                                <span className="inline-block w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                <span>Synthesizing…</span>
                            </>
                        ) : (
                            <>
                                <span>⚡ Generate Variations</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            {error && <p className="mt-4 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 p-3 rounded-lg">{error}</p>}

            {suggestions && (
                <div className="mt-5 overflow-x-auto relative z-10">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-800 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                                <th className="pb-3 pr-4">Domain Candidate</th>
                                <th className="pb-3 pr-4">Estimated FMV</th>
                                <th className="pb-3 pr-4">Availability</th>
                                <th className="pb-3 text-right">Instant Dossier</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {suggestions.map((s) => (
                                <tr key={s.domain} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="py-3 pr-4 font-mono font-medium text-slate-200 group-hover:text-cyan-300 transition-colors">
                                        {s.domain}
                                    </td>
                                    <td className="py-3 pr-4 font-bold text-emerald-400 font-mono">
                                        {formatUsd(s.midUsd)}
                                    </td>
                                    <td className="py-3 pr-4">
                                        {s.registered === null ? (
                                            <span className="text-xs text-slate-500 font-medium">Unchecked</span>
                                        ) : s.registered ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                Registered
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                Available
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 text-right">
                                        <Link
                                            href={`/valuation/${encodeURIComponent(s.domain)}`}
                                            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 group-hover:translate-x-0.5 transition-all"
                                        >
                                            <span>Analyze</span>
                                            <span>→</span>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
