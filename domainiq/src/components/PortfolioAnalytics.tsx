'use client';

import { useEffect, useState } from 'react';
import HorizontalBarChart, { type BarDatum } from './HorizontalBarChart';
import { formatUsd } from '@/lib/format';

interface Analytics {
    totalValueUsd: number;
    domainCount: number;
    pricedCount: number;
    byVertical: BarDatum[];
    byTld: BarDatum[];
}

export default function PortfolioAnalytics() {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/watchlist/analytics')
            .then((res) => res.json())
            .then((d) => setData(d))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return null;
    if (!data || data.domainCount === 0) return null;

    return (
        <div className="card p-6">
            <h2 className="mb-4 text-lg font-semibold">Portfolio composition</h2>
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                    <p className="text-2xl font-bold text-brand-600">{formatUsd(data.totalValueUsd)}</p>
                    <p className="text-xs text-slate-500">Total estimated value</p>
                </div>
                <div>
                    <p className="text-2xl font-bold">{data.domainCount}</p>
                    <p className="text-xs text-slate-500">Domains tracked</p>
                </div>
                <div>
                    <p className="text-2xl font-bold">{data.pricedCount}</p>
                    <p className="text-xs text-slate-500">With a valuation on file</p>
                </div>
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
                <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">By vertical</h3>
                    <HorizontalBarChart data={data.byVertical} hue="blue" formatValue={formatUsd} />
                </div>
                <div>
                    <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">By extension</h3>
                    <HorizontalBarChart data={data.byTld} hue="orange" formatValue={formatUsd} />
                </div>
            </div>
        </div>
    );
}
