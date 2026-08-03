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
        <section className="card p-8">
            <div className="mb-1 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Not quite right? Try these alternatives</h2>
                {!suggestions && (
                    <button onClick={load} disabled={loading} className="btn-secondary !py-1.5 !px-3 text-sm">
                        {loading ? 'Generating…' : 'Generate alternatives'}
                    </button>
                )}
            </div>
            <p className="mb-4 text-sm text-slate-500">
                Algorithmically blended from &ldquo;{seed}&rdquo; with brandable affixes and category-relevant theme
                words — not an LLM, deterministic every time.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {suggestions && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-slate-400">
                            <tr>
                                <th className="pb-2 pr-4">Domain</th>
                                <th className="pb-2 pr-4">Estimate</th>
                                <th className="pb-2 pr-4">Availability</th>
                                <th className="pb-2">Report</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suggestions.map((s) => (
                                <tr key={s.domain} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="py-2 pr-4 font-medium">{s.domain}</td>
                                    <td className="py-2 pr-4 font-semibold text-brand-600">{formatUsd(s.midUsd)}</td>
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
        </section>
    );
}
