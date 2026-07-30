'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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

function CompareInner() {
    const searchParams = useSearchParams();
    const [inputs, setInputs] = useState<string[]>(['', '', '']);
    const [rows, setRows] = useState<Row[]>([]);

    useEffect(() => {
        const a = searchParams.get('a');
        if (a) setInputs([a, '', '']);
    }, [searchParams]);

    async function runCompare() {
        const domains = inputs.map((d) => d.trim()).filter(Boolean);
        if (domains.length < 2) return;

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

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold">Compare domains side by side</h1>
                <p className="mt-2 text-slate-500">Enter 2-4 domains to compare their estimated value and scoring factors.</p>
            </div>

            <div className="card space-y-3 p-6">
                {inputs.map((val, i) => (
                    <input
                        key={i}
                        className="input"
                        placeholder={`Domain ${i + 1}`}
                        value={val}
                        onChange={(e) => setInputs((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                    />
                ))}
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        className="text-sm text-brand-600 hover:underline"
                        onClick={() => setInputs((prev) => [...prev, ''])}
                        disabled={inputs.length >= 4}
                    >
                        + Add another domain
                    </button>
                    <button type="button" className="btn-primary" onClick={runCompare}>
                        Compare
                    </button>
                </div>
            </div>

            {rows.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-slate-400">
                            <tr>
                                <th className="pb-2 pr-4">Domain</th>
                                <th className="pb-2 pr-4">Estimate</th>
                                <th className="pb-2 pr-4">Range</th>
                                <th className="pb-2 pr-4">Confidence</th>
                                <th className="pb-2 pr-4">Score</th>
                                <th className="pb-2">Keyword</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.domain} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="py-3 pr-4 font-medium">{r.domain}</td>
                                    {r.loading ? (
                                        <td colSpan={5} className="py-3 text-slate-400">Loading…</td>
                                    ) : r.error ? (
                                        <td colSpan={5} className="py-3 text-red-500">{r.error}</td>
                                    ) : (
                                        <>
                                            <td className="py-3 pr-4 font-semibold text-brand-600">{formatUsd(r.midUsd!)}</td>
                                            <td className="py-3 pr-4 text-slate-500">{formatUsd(r.lowUsd!)} – {formatUsd(r.highUsd!)}</td>
                                            <td className="py-3 pr-4 capitalize">{r.confidence}</td>
                                            <td className="py-3 pr-4">{r.linguisticScore}/100</td>
                                            <td className="py-3">{r.keyword ? `${r.keyword.keyword} (${r.keyword.tier})` : '—'}</td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
