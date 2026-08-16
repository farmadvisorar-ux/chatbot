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

export default function SuggestPage() {
    const [seed, setSeed] = useState('');
    const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const clean = seed.trim();
        if (!clean) return;

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
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold">Brandable name suggestions</h1>
                <p className="mt-2 text-slate-500">
                    Type a keyword and get algorithmically-generated brandable domain candidates — blended with
                    startup-brand affixes and category-relevant theme words, each checked live for registration
                    availability and scored by the same engine as every valuation report.
                </p>
                <p className="mt-2 text-xs text-slate-400">
                    This is a deterministic word-blending algorithm, not an LLM — same input always gives the same
                    candidates.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-6 sm:flex-row">
                <input
                    className="input"
                    placeholder="e.g. pet, invoice, climate"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    autoFocus
                />
                <button type="submit" className="btn-primary whitespace-nowrap" disabled={loading}>
                    {loading ? 'Generating…' : 'Generate names'}
                </button>
            </form>

            {error && <p className="text-center text-sm text-red-600">{error}</p>}

            {suggestions && (
                <div className="card p-6">
                    {suggestions.length === 0 ? (
                        <p className="text-slate-400">No candidates generated for that keyword — try a shorter, plainer word.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-slate-400">
                                    <tr>
                                        <th className="pb-2 pr-4">Domain</th>
                                        <th className="pb-2 pr-4">Estimate</th>
                                        <th className="pb-2 pr-4">Score</th>
                                        <th className="pb-2 pr-4">Availability</th>
                                        <th className="pb-2">Report</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {suggestions.map((s) => (
                                        <tr key={s.domain} className="border-t border-slate-100 dark:border-slate-800">
                                            <td className="py-2 pr-4 font-medium">{s.domain}</td>
                                            <td className="py-2 pr-4 font-semibold text-brand-600">{formatUsd(s.midUsd)}</td>
                                            <td className="py-2 pr-4">{s.linguisticScore}/100</td>
                                            <td className="py-2 pr-4">
                                                {s.registered === null ? (
                                                    <span className="text-slate-400">Unknown</span>
                                                ) : s.registered ? (
                                                    <span className="text-amber-600">Taken</span>
                                                ) : (
                                                    <span className="text-emerald-600">Available</span>
                                                )}
                                            </td>
                                            <td className="py-2">
                                                <Link href={`/valuation/${encodeURIComponent(s.domain)}`} className="text-brand-600 hover:underline">
                                                    View →
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
