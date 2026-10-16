'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeDomain } from '@/lib/domain';

const PRESETS = [
    { label: '🔥 AI Tech', domain: 'neural.ai' },
    { label: '💎 Rare 3L', domain: 'sky.com' },
    { label: '🏛️ Mega Comp', domain: 'insurance.com' },
    { label: '⚡ Fintech', domain: 'quickpay.io' },
    { label: '🚀 Enterprise', domain: 'cloudscale.net' },
];

export default function DomainCheckerForm({
    autoFocus = true,
    size = 'lg',
    showPresets = true,
}: {
    autoFocus?: boolean;
    size?: 'lg' | 'md';
    showPresets?: boolean;
}) {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [recents, setRecents] = useState<string[]>([]);
    const router = useRouter();

    useEffect(() => {
        try {
            const stored = localStorage.getItem('domainiq_recent_searches');
            if (stored) {
                setRecents(JSON.parse(stored).slice(0, 4));
            }
        } catch {
            // ignore
        }
    }, []);

    function executeValuation(targetDomain: string) {
        if (!targetDomain || !targetDomain.trim()) {
            setError('Please enter a domain name to evaluate (e.g. quantum.ai or brand.com)');
            return;
        }

        const clean = normalizeDomain(targetDomain);


        try {
            const updated = [clean, ...recents.filter((r) => r !== clean)].slice(0, 5);
            setRecents(updated);
            localStorage.setItem('domainiq_recent_searches', JSON.stringify(updated));
        } catch {
            // ignore
        }

        setError(null);
        router.push(`/valuation/${encodeURIComponent(clean)}`);
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        executeValuation(value);
    }

    const cleanInput = value.trim().toLowerCase();
    const parts = cleanInput.split('.');
    const detectedTld = parts.length > 1 ? parts[parts.length - 1] : null;

    return (
        <div className="w-full space-y-3">
            <form onSubmit={handleSubmit} className="w-full relative">
                <div className="relative flex flex-col gap-2.5 sm:flex-row items-center p-1.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl shadow-brand-950/50 backdrop-blur-xl focus-within:border-brand-500/80 focus-within:ring-4 focus-within:ring-brand-500/20 transition-all duration-300">
                    {/* Left Icon */}
                    <div className="hidden sm:flex items-center pl-3.5 text-slate-400">
                        <span className="font-mono text-xs font-bold text-brand-400">IQ &gt;</span>
                    </div>

                    <input
                        className={`w-full bg-transparent px-3 py-3 text-white placeholder:text-slate-500 focus:outline-none font-mono text-base sm:text-lg tracking-tight ${
                            size === 'lg' ? 'py-3.5' : ''
                        }`}
                        placeholder="yourdomain.com (e.g. cloudscale.ai)"
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value);
                            if (error) setError(null);
                        }}
                        autoFocus={autoFocus}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />

                    {/* Live Typing Radar Badge */}
                    {cleanInput.length > 0 && (
                        <div className="hidden md:flex items-center gap-2 pr-3 text-[11px] font-mono text-slate-400 shrink-0">
                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                                {cleanInput.length} chars
                            </span>
                            {detectedTld && (
                                <span className="px-2 py-0.5 rounded bg-brand-950 text-brand-300 border border-brand-800 font-bold uppercase">
                                    .{detectedTld}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className={`btn-primary whitespace-nowrap w-full sm:w-auto shrink-0 shadow-lg ${
                            size === 'lg' ? 'text-base py-3.5 px-7' : '!py-2.5 !px-5'
                        }`}
                    >
                        <span>Appraise Domain</span>
                        <span className="ml-2 font-mono text-xs opacity-75 hidden sm:inline">↵</span>
                    </button>
                </div>

                {error && (
                    <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-800/80 text-xs text-red-300 font-mono flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}
            </form>

            {/* Quick-Pick Presets & Recent Searches */}
            {showPresets && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
                    <span className="text-slate-500 font-mono text-[11px]">Instant Try:</span>
                    {PRESETS.map((p) => (
                        <button
                            key={p.domain}
                            type="button"
                            onClick={() => {
                                setValue(p.domain);
                                executeValuation(p.domain);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-mono text-[11px] transition-colors"
                        >
                            {p.label} <span className="text-brand-400">({p.domain})</span>
                        </button>
                    ))}

                    {recents.length > 0 && (
                        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-800 text-[11px] text-slate-500">
                            <span>Recent:</span>
                            {recents.slice(0, 3).map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => {
                                        setValue(r);
                                        executeValuation(r);
                                    }}
                                    className="text-slate-400 hover:text-brand-300 font-mono underline"
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
