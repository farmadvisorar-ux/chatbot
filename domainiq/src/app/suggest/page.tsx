'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { formatUsd } from '@/lib/format';

interface Suggestion {
    domain: string;
    midUsd: number;
    confidence: string;
    linguisticScore: number;
    registered: boolean | null;
}

const INSPIRATION_CHIPS = ['ai', 'pay', 'cloud', 'eco', 'code', 'vault', 'mind', 'nexus'];

export default function SuggestPage() {
    const [seed, setSeed] = useState('');
    const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function generateNames(targetSeed: string) {
        const clean = targetSeed.trim().toLowerCase();
        if (!clean) return;

        setSeed(clean);
        setLoading(true);
        setError(null);
        setSuggestions(null);
        try {
            const res = await fetch('/api/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seed: clean }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Something went wrong');
                return;
            }
            setSuggestions(data.suggestions);
        } catch {
            setError('Could not generate candidates right now.');
        } finally {
            setLoading(false);
        }
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        generateNames(seed);
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8 py-4">
            <div className="text-center space-y-3">
                <span className="text-xs bg-brand-500/20 text-brand-300 font-mono font-bold px-3 py-1 rounded-full border border-brand-500/30">
                    ALGORITHMIC NAME GENERATOR
                </span>
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                    Brandable Name Generator
                </h1>
                <p className="mt-2 text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
                    Type a root concept and get deterministic brand candidates blended with startup affixes, live availability detection, and instant algorithmic pricing.
                </p>
            </div>

            {/* Inspiration Chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="text-slate-500 font-mono text-[11px]">Instant Seeds:</span>
                {INSPIRATION_CHIPS.map((chip) => (
                    <button
                        key={chip}
                        type="button"
                        onClick={() => generateNames(chip)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-mono text-[11px] hover:border-slate-700 transition-colors"
                    >
                        #{chip}
                    </button>
                ))}
            </div>

            {/* Search Input Card */}
            <form onSubmit={handleSubmit} className="card p-3 sm:p-4 flex flex-col gap-2.5 sm:flex-row items-center border-slate-700/80">
                <input
                    className="input font-mono text-base"
                    placeholder="Enter root keyword (e.g. quantum, vault, pulse)"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    autoFocus
                />
                <button type="submit" className="btn-primary whitespace-nowrap w-full sm:w-auto px-6 py-3 text-xs font-bold" disabled={loading}>
                    {loading ? 'Synthesizing…' : 'Generate Candidates →'}
                </button>
            </form>

            {error && <p className="text-center text-xs text-red-400 font-mono bg-red-950/60 p-3 rounded-lg border border-red-800">{error}</p>}

            {/* Suggestions Results */}
            {suggestions && (
                <div className="card p-6 sm:p-8 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                            <span>✨</span> Generated Candidates for &ldquo;<span className="text-brand-400">{seed}</span>&rdquo;
                        </h2>
                        <span className="text-xs text-slate-400 font-mono">{suggestions.length} names synthesized</span>
                    </div>

                    {suggestions.length === 0 ? (
                        <p className="text-slate-400 text-sm py-4">No candidates generated for that keyword — try a shorter base word.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs sm:text-sm">
                                <thead className="border-b border-slate-800 text-slate-400 font-mono text-xs">
                                    <tr>
                                        <th className="pb-3 pr-4">Domain</th>
                                        <th className="pb-3 pr-4">Estimated FMV</th>
                                        <th className="pb-3 pr-4">Linguistic Score</th>
                                        <th className="pb-3 pr-4">Availability</th>
                                        <th className="pb-3">Deep Audit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {suggestions.map((s) => (
                                        <tr key={s.domain} className="hover:bg-slate-900/40 transition-colors">
                                            <td className="py-3 pr-4 font-bold text-white font-mono">{s.domain}</td>
                                            <td className="py-3 pr-4 font-mono font-bold text-emerald-400">{formatUsd(s.midUsd)}</td>
                                            <td className="py-3 pr-4 font-mono text-slate-300">{s.linguisticScore}/100</td>
                                            <td className="py-3 pr-4">
                                                {s.registered === null ? (
                                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">Unknown</span>
                                                ) : s.registered ? (
                                                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-mono font-bold">Registered</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono font-bold">Available Now</span>
                                                )}
                                            </td>
                                            <td className="py-3">
                                                <Link href={`/valuation/${encodeURIComponent(s.domain)}`} className="text-brand-400 hover:text-brand-300 font-mono text-xs font-semibold underline">
                                                    Inspect →
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
