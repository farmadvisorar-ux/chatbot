import type { Metadata } from 'next';
import Link from 'next/link';
import { performValuation } from '@/lib/valuation-request';
import { getSession } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { formatUsd, formatUsdExact } from '@/lib/format';
import ScoreBar from '@/components/ScoreBar';
import SaveToWatchlistButton from '@/components/SaveToWatchlistButton';
import AdSlot from '@/components/AdSlot';

export const dynamic = 'force-dynamic';

interface Props {
    params: { domain: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const domain = decodeURIComponent(params.domain);
    return {
        title: `${domain} valuation — DomainIQ`,
        description: `Free, explainable estimate of what ${domain} is worth, based on comparable sales and multi-factor scoring.`,
    };
}

const CONFIDENCE_STYLE: Record<string, string> = {
    high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export default async function ValuationPage({ params }: Props) {
    const domain = decodeURIComponent(params.domain);
    const { result, error } = await performValuation(domain);

    if (error || !result) {
        return (
            <div className="mx-auto max-w-xl text-center">
                <h1 className="text-2xl font-bold">Couldn&apos;t evaluate that domain</h1>
                <p className="mt-2 text-slate-500">{error}</p>
                <Link href="/" className="btn-primary mt-6 inline-flex">Try another domain</Link>
            </div>
        );
    }

    const session = await getSession();
    let alreadySaved = false;
    if (session) {
        const { rows } = await getPool().query('SELECT 1 FROM watchlist WHERE user_id = $1 AND domain = $2', [session.id, result.domain]);
        alreadySaved = rows.length > 0;
    }

    return (
        <div className="mx-auto max-w-4xl space-y-10">
            <section className="card p-8 text-center">
                <p className="text-sm text-slate-500">Estimated value for</p>
                <h1 className="mt-1 text-3xl font-bold">{result.domain}</h1>

                {result.exactComp && (
                    <div className="mx-auto mt-4 max-w-md rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                        📌 This exact domain has a recorded sale: <strong>{formatUsdExact(result.exactComp.sale_price_usd)}</strong>
                        {result.exactComp.sale_year ? ` in ${result.exactComp.sale_year}` : ''} ({result.exactComp.source_note})
                    </div>
                )}

                <div className="mt-6 text-5xl font-extrabold text-brand-600">{formatUsd(result.midUsd)}</div>
                <p className="mt-2 text-slate-500">
                    Range: {formatUsd(result.lowUsd)} – {formatUsd(result.highUsd)}
                </p>
                <span className={`label-pill mt-3 ${CONFIDENCE_STYLE[result.confidence]}`}>
                    {result.confidence.toUpperCase()} confidence
                </span>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <SaveToWatchlistButton domain={result.domain} signedIn={Boolean(session)} initiallySaved={alreadySaved} />
                    <Link href={`/compare?a=${encodeURIComponent(result.domain)}`} className="btn-secondary">Compare</Link>
                    <a
                        href={`https://dan.com/buy-domain/${encodeURIComponent(result.domain)}`}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="btn-secondary"
                    >
                        List this domain for sale →
                    </a>
                </div>
            </section>

            <section className="card p-8">
                <h2 className="mb-6 text-xl font-semibold">Valuation breakdown</h2>
                <div className="space-y-5">
                    {result.factors.map((f) => (
                        <ScoreBar key={f.key} label={`${f.label} (${Math.round(f.weight * 100)}% weight)`} score={f.score} detail={f.detail} />
                    ))}
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Extension</p>
                        <p className="mt-1 font-semibold">.{result.tld} — authority {result.tld_authority}/100</p>
                        <p className="mt-1 text-sm text-slate-500">{result.tld_label}</p>
                        <p className="mt-1 text-sm text-slate-500">Price multiplier vs. equivalent .com: ×{result.tld_multiplier.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Keyword demand</p>
                        {result.keyword ? (
                            <>
                                <p className="mt-1 font-semibold">
                                    &ldquo;{result.keyword.keyword}&rdquo; — Tier {result.keyword.tier}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Category: {result.keyword.category} · ×{result.keyword.multiplier.toFixed(1)} demand multiplier
                                </p>
                            </>
                        ) : (
                            <p className="mt-1 text-sm text-slate-500">No high-commercial-value keyword detected in this domain.</p>
                        )}
                    </div>
                    {result.age && (
                        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 sm:col-span-2">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Registration age</p>
                            {result.age.registered ? (
                                <p className="mt-1 text-sm text-slate-500">
                                    {result.age.ageYears ? `~${result.age.ageYears.toFixed(1)} years old` : 'Registered, age unavailable'}
                                    {result.age.registrationDate ? ` (registered ${new Date(result.age.registrationDate).toLocaleDateString()})` : ''}
                                </p>
                            ) : (
                                <p className="mt-1 text-sm text-slate-500">
                                    This domain doesn&apos;t appear to be currently registered — you may be able to register it directly for
                                    the standard annual fee instead of buying on the aftermarket.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {result.comps.length > 0 && (
                <section className="card p-8">
                    <h2 className="mb-1 text-xl font-semibold">Comparable sales considered</h2>
                    <p className="mb-4 text-sm text-slate-500">
                        Matched by extension, category and length similarity. Comps contributed{' '}
                        <strong>{Math.round(result.compsWeight * 100)}%</strong> weight to the final estimate.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-400">
                                <tr>
                                    <th className="pb-2 pr-4">Domain</th>
                                    <th className="pb-2 pr-4">Sale price</th>
                                    <th className="pb-2 pr-4">Year</th>
                                    <th className="pb-2 pr-4">Similarity</th>
                                    <th className="pb-2">Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.comps.map((c) => (
                                    <tr key={c.domain} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="py-2 pr-4 font-medium">{c.domain}</td>
                                        <td className="py-2 pr-4">{formatUsdExact(c.sale_price_usd)}</td>
                                        <td className="py-2 pr-4">{c.sale_year ?? '—'}</td>
                                        <td className="py-2 pr-4">{c.similarity}%</td>
                                        <td className="py-2 text-slate-500">{c.source_note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <AdSlot />

            <p className="text-center text-xs text-slate-400">
                This is an algorithmic estimate for informational purposes, not a formal appraisal or a guarantee of sale
                price. Actual market value depends on buyer demand at the time of sale.{' '}
                <Link href="/how-it-works" className="underline">See full methodology</Link>.
            </p>
        </div>
    );
}
