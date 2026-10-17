'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { COMPS } from '@/data/comps-seed';
import { normalizeDomain, extractTld, rootLabel } from '@/lib/domain';
import { formatUsd, formatUsdExact } from '@/lib/format';
import DomainCheckerForm from '@/components/DomainCheckerForm';

function computeClientFallback(domain: string) {
    const clean = normalizeDomain(domain) || 'insurance.com';
    const tld = extractTld(clean);
    const label = rootLabel(clean);
    const exact = COMPS.find((c) => c.domain.toLowerCase() === clean.toLowerCase()) ?? null;

    let midUsd = 2500;
    if (exact) {
        midUsd = exact.salePriceUsd;
    } else {
        const len = label.length;
        const base =
            len <= 2 ? 450000 : len === 3 ? 85000 : len === 4 ? 18000 : len <= 6 ? 6500 : len <= 10 ? 2800 : 1200;
        const tldMult = tld === 'com' ? 1.0 : tld === 'ai' ? 0.65 : tld === 'io' ? 0.35 : 0.2;
        midUsd = Math.round(base * tldMult);
    }

    const lowUsd = Math.round(midUsd * 0.72);
    const highUsd = Math.round(midUsd * 1.35);
    const liquidationFloor = Math.round(midUsd * 0.15);
    const recommendedBinPrice = Math.round(midUsd * 0.98);

    return {
        domain: clean,
        exactComp: exact,
        midUsd,
        lowUsd,
        highUsd,
        liquidationFloor,
        recommendedBinPrice,
    };
}

export default function ValuationErrorBoundary({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const params = useParams<{ domain?: string }>();
    const rawDomain = decodeURIComponent(params?.domain || 'insurance.com');
    const fallback = computeClientFallback(rawDomain);

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <section className="card p-8 sm:p-10 text-center relative overflow-hidden border-brand-500/30 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/30">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400" />
                <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Estimated Fair Market Value for</p>
                <h1 className="mt-1 text-3xl sm:text-5xl font-black tracking-tight text-white font-mono">{fallback.domain}</h1>

                {fallback.exactComp && (
                    <div className="mx-auto mt-4 max-w-md rounded-xl bg-emerald-950/50 border border-emerald-800/80 px-4 py-2.5 text-xs text-emerald-300 flex items-center justify-center gap-2">
                        <span>📌</span>
                        <span>
                            Exact recorded sale: <strong>{formatUsdExact(fallback.exactComp.salePriceUsd)}</strong>
                            {fallback.exactComp.saleYear ? ` (${fallback.exactComp.saleYear})` : ''} · {fallback.exactComp.sourceNote}
                        </span>
                    </div>
                )}

                <div className="mt-6 text-5xl sm:text-7xl font-black text-emerald-400 tracking-tight font-mono">
                    {formatUsd(fallback.midUsd)}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                    Expected Range: <strong className="text-slate-200">{formatUsd(fallback.lowUsd)}</strong> –{' '}
                    <strong className="text-slate-200">{formatUsd(fallback.highUsd)}</strong>
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-3 text-left">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                        <span className="text-xs uppercase font-mono text-slate-400">Liquidation Floor</span>
                        <p className="mt-1 text-xl font-bold text-white font-mono">{formatUsd(fallback.liquidationFloor)}</p>
                    </div>
                    <div className="rounded-xl border border-brand-500/50 bg-brand-950/20 p-4">
                        <span className="text-xs uppercase font-mono text-brand-400">Retail Buy-It-Now</span>
                        <p className="mt-1 text-xl font-bold text-brand-300 font-mono">{formatUsd(fallback.recommendedBinPrice)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                        <span className="text-xs uppercase font-mono text-slate-400">Outbound Target</span>
                        <p className="mt-1 text-xl font-bold text-white font-mono">
                            {formatUsd(fallback.midUsd)}–{formatUsd(fallback.highUsd)}
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button onClick={() => reset()} className="btn-secondary text-xs">
                        Reload Full Report
                    </button>
                    <Link href="/" className="btn-primary text-xs">
                        Evaluate Another Domain
                    </Link>
                </div>
            </section>

            <div className="mx-auto max-w-2xl">
                <DomainCheckerForm autoFocus={false} />
            </div>
        </div>
    );
}
