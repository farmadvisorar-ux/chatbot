'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatUsd } from '@/lib/format';

interface WatchlistItem {
    id: number;
    domain: string;
    label: string | null;
    created_at: string;
    latest: { mid_usd: number; low_usd: number; high_usd: number; confidence: string } | null;
    previousMidUsd: number | null;
}

export default function WatchlistPanel() {
    const [items, setItems] = useState<WatchlistItem[]>([]);
    const [newDomain, setNewDomain] = useState('');
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const res = await fetch('/api/watchlist');
            const data = await res.json();
            setItems(data.items ?? []);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    async function addDomain() {
        const domain = newDomain.trim();
        if (!domain) return;
        setAdding(true);
        try {
            await fetch('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });
            setNewDomain('');
            await load();
        } finally {
            setAdding(false);
        }
    }

    async function remove(domain: string) {
        await fetch(`/api/watchlist?domain=${encodeURIComponent(domain)}`, { method: 'DELETE' });
        setItems((prev) => prev.filter((i) => i.domain !== domain));
    }

    const totalMid = items.reduce((sum, i) => sum + (i.latest?.mid_usd ?? 0), 0);

    return (
        <div className="space-y-6">
            <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-end">
                <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium">Add a domain to your watchlist</label>
                    <input
                        className="input"
                        placeholder="example.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                    />
                </div>
                <button className="btn-primary" onClick={addDomain} disabled={adding}>
                    {adding ? 'Adding…' : '+ Add'}
                </button>
            </div>

            <div className="card p-6">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Your watchlist ({items.length})</h2>
                    <p className="text-slate-500">
                        Portfolio total: <strong className="text-brand-600">{formatUsd(totalMid)}</strong>
                    </p>
                </div>

                {loading ? (
                    <p className="text-slate-400">Loading…</p>
                ) : items.length === 0 ? (
                    <p className="text-slate-400">No domains saved yet. Add one above, or save one from any valuation page.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-400">
                                <tr>
                                    <th className="pb-2 pr-4">Domain</th>
                                    <th className="pb-2 pr-4">Estimate</th>
                                    <th className="pb-2 pr-4">Change</th>
                                    <th className="pb-2 pr-4">Confidence</th>
                                    <th className="pb-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const change =
                                        item.latest && item.previousMidUsd
                                            ? ((item.latest.mid_usd - item.previousMidUsd) / item.previousMidUsd) * 100
                                            : null;
                                    return (
                                        <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                                            <td className="py-2 pr-4 font-medium">
                                                <Link href={`/valuation/${encodeURIComponent(item.domain)}`} className="hover:text-brand-600 hover:underline">
                                                    {item.domain}
                                                </Link>
                                            </td>
                                            <td className="py-2 pr-4 font-semibold text-brand-600">
                                                {item.latest ? formatUsd(item.latest.mid_usd) : '—'}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {change === null ? (
                                                    <span className="text-slate-400">—</span>
                                                ) : (
                                                    <span className={change >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                                                        {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-4 capitalize">{item.latest?.confidence ?? '—'}</td>
                                            <td className="py-2">
                                                <button onClick={() => remove(item.domain)} className="text-red-500 hover:underline">
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
