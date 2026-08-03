'use client';

import { useState } from 'react';

export interface BarDatum {
    label: string;
    valueUsd: number;
    count: number;
}

/**
 * A single-hue ranked horizontal bar chart — the default form for "compare
 * magnitude across named categories" per the dataviz method: one hue,
 * direct labels, no legend needed since each bar is self-labeled. Thin
 * marks, 4px rounded data-ends, a native-tooltip hover layer.
 */
export default function HorizontalBarChart({
    data,
    hue = 'blue',
    formatValue,
}: {
    data: BarDatum[];
    hue?: 'blue' | 'orange';
    formatValue: (n: number) => string;
}) {
    const [hovered, setHovered] = useState<string | null>(null);
    const max = Math.max(1, ...data.map((d) => d.valueUsd));
    const barColorVar = hue === 'blue' ? 'var(--bar-blue)' : 'var(--bar-orange)';

    if (data.length === 0) {
        return <p className="text-sm text-slate-400">No priced domains yet.</p>;
    }

    return (
        <div
            className="viz-root space-y-2"
            style={
                {
                    '--bar-blue': '#1b3fe0',
                    '--bar-orange': '#c2540a',
                } as React.CSSProperties
            }
        >
            <style>{`
                .viz-root { color-scheme: light; }
                @media (prefers-color-scheme: dark) {
                    :root:where(:not([data-theme="light"])) .viz-root { --bar-blue: #5583ff; --bar-orange: #f0975a; }
                }
                :root[data-theme="dark"] .viz-root { --bar-blue: #5583ff; --bar-orange: #f0975a; }
            `}</style>
            {data.map((d) => {
                const widthPct = Math.max(2, (d.valueUsd / max) * 100);
                const isHovered = hovered === d.label;
                return (
                    <div
                        key={d.label}
                        className="group"
                        onMouseEnter={() => setHovered(d.label)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <div className="mb-1 flex items-baseline justify-between text-xs">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{d.label}</span>
                            <span className="text-slate-500">
                                {formatValue(d.valueUsd)} · {d.count} domain{d.count === 1 ? '' : 's'}
                            </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                                className="h-full rounded-full transition-opacity"
                                style={{ width: `${widthPct}%`, backgroundColor: barColorVar, opacity: isHovered ? 0.75 : 1 }}
                                title={`${d.label}: ${formatValue(d.valueUsd)} across ${d.count} domain${d.count === 1 ? '' : 's'}`}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
