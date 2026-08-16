'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatUsd } from '@/lib/format';

interface BulkRow {
    domain: string;
    result?: {
        midUsd: number;
        lowUsd: number;
        highUsd: number;
        confidence: string;
        linguisticScore: number;
    };
    error?: string;
}

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
                setNotice(`Only the first ${data.maxBatch} domains were checked. Sign up for larger batches.`);
            }
            setRows(
                data.results.map((r: any) => ({
                    domain: r.domain,
                    result: r.result
                        ? {
                              midUsd: r.result.midUsd,
                              lowUsd: r.result.lowUsd,
                              highUsd: r.result.highUsd,
                              confidence: r.result.confidence,
                              linguisticScore: r.result.linguisticScore,
                          }
                        : undefined,
                    error: r.error,
                })),
            );
        } finally {
            setLoading(false);
        }
    }

    const totalMid = rows.reduce((sum, r) => sum + (r.result?.midUsd ?? 0), 0);

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold">Bulk portfolio valuation</h1>
                <p className="mt-2 text-slate-500">
                    Paste domains (one per line, or comma-separated) to value your whole portfolio at once.
                </p>
            </div>

            <div className="card space-y-4 p-6">
                <textarea
                    className="input h-40 font-mono text-sm"
                    placeholder={'example.com\nmystartup.io\nanotherbrand.ai'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">Free: 10 domains per check. Signed-in: up to 200.</p>
                    <button type="button" className="btn-primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Evaluating…' : 'Evaluate portfolio'}
                    </button>
                </div>
                {notice && <p className="text-sm text-amber-600">{notice}</p>}
            </div>

            {rows.length > 0 && (
                <div className="card p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Results ({rows.length})</h2>
                        <p className="text-slate-500">
                            Estimated portfolio total: <strong className="text-brand-600">{formatUsd(totalMid)}</strong>
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-400">
                                <tr>
                                    <th className="pb-2 pr-4">Domain</th>
                                    <th className="pb-2 pr-4">Estimate</th>
                                    <th className="pb-2 pr-4">Range</th>
                                    <th className="pb-2 pr-4">Confidence</th>
                                    <th className="pb-2">Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.domain} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="py-2 pr-4 font-medium">
                                            <Link href={`/valuation/${encodeURIComponent(r.domain)}`} className="hover:text-brand-600 hover:underline">
                                                {r.domain}
                                            </Link>
                                        </td>
                                        {r.result ? (
                                            <>
                                                <td className="py-2 pr-4 font-semibold text-brand-600">{formatUsd(r.result.midUsd)}</td>
                                                <td className="py-2 pr-4 text-slate-500">{formatUsd(r.result.lowUsd)} – {formatUsd(r.result.highUsd)}</td>
                                                <td className="py-2 pr-4 capitalize">{r.result.confidence}</td>
                                                <td className="py-2">{r.result.linguisticScore}/100</td>
                                            </>
                                        ) : (
                                            <td colSpan={4} className="py-2 text-red-500">{r.error}</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
