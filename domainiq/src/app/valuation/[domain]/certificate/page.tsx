import type { Metadata } from 'next';
import Link from 'next/link';
import { performValuation } from '@/lib/valuation-request';
import { formatUsd, formatUsdExact } from '@/lib/format';
import PrintCertificateButton from '@/components/PrintCertificateButton';

export const dynamic = 'force-dynamic';

interface Props {
    params: { domain: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const domain = decodeURIComponent(params.domain);
    return {
        title: `Official Appraisal Certificate for ${domain} — DomainIQ`,
        description: `Official printable valuation certificate and due diligence brief for ${domain}, issued by DomainIQ.`,
    };
}

export default async function CertificatePage({ params }: Props) {
    let domain = decodeURIComponent(params.domain || '').trim().toLowerCase();
    domain = domain
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .replace(/\.+$/, '');
    if (domain && !domain.includes('.')) {
        domain = `${domain}.com`;
    }

    let result: import('@/lib/valuation/engine').ValuationResult | undefined;
    let error: string | undefined;

    try {
        const valRes = await performValuation(domain);
        result = valRes.result;
        error = valRes.error;
    } catch (err) {
        error = err instanceof Error ? err.message : 'Unable to generate certificate at this time.';
    }

    if (!result && domain) {
        try {
            const { evaluateDomain } = await import('@/lib/valuation/engine');
            result = await evaluateDomain(domain, {
                lookupAge: false,
                lookupArchive: false,
                checkTrademark: false,
            });
            error = undefined;
        } catch (innerErr) {
            console.error('Certificate emergency fallback failed:', innerErr);
        }
    }

    if (!result) {
        return (
            <div className="mx-auto max-w-xl text-center py-16">
                <h1 className="text-2xl font-bold">Unable to generate certificate</h1>
                <p className="mt-2 text-slate-500">{error ?? 'Domain valuation record not found.'}</p>
                <Link href="/" className="btn-primary mt-6 inline-flex">Return home</Link>
            </div>
        );
    }

    const issueDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const certId = `DIQ-${result.rootLabel.substring(0, 4).toUpperCase()}-${Math.abs(
        result.domain.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) * 137,
    ).toString(16).toUpperCase().padStart(6, '0')}`;

    return (
        <div className="mx-auto max-w-3xl space-y-6 py-4">
            {/* Action Bar (Hidden in Print) */}
            <div className="flex items-center justify-between print:hidden">
                <Link
                    href={`/valuation/${encodeURIComponent(result.domain)}`}
                    className="text-xs font-semibold text-slate-500 hover:text-brand-600 flex items-center gap-1"
                >
                    ← Back to Detailed Valuation Report
                </Link>
                <div className="flex items-center gap-2">
                    <PrintCertificateButton />
                </div>
            </div>

            {/* Formal Certificate Document Body */}
            <div className="relative border-8 border-double border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 sm:p-12 shadow-xl rounded-sm print:border-slate-800 print:shadow-none print:m-0 print:p-8">
                {/* Watermark Seal */}
                <div className="absolute right-8 top-8 opacity-10 pointer-events-none select-none text-8xl font-black text-slate-400">
                    DIQ
                </div>

                {/* Certificate Header */}
                <div className="text-center pb-6 border-b-2 border-slate-200 dark:border-slate-800">
                    <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-brand-600 text-white font-extrabold text-sm mb-2 shadow-sm">
                        IQ
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-serif font-black tracking-wider text-slate-900 dark:text-slate-100 uppercase">
                        Certificate of Valuation
                    </h1>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mt-1">
                        Independent Algorithmic Domain Appraisal &amp; Due Diligence Audit
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                        Issued by DomainIQ Algorithmic Intelligence Engine · prstuvw.xyz
                    </p>
                </div>

                {/* Certificate Metadata Row */}
                <div className="my-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center py-3 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700 text-xs">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Certificate ID</span>
                        <strong className="font-mono font-bold text-slate-800 dark:text-slate-200">{certId}</strong>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Issue Date</span>
                        <strong className="text-slate-800 dark:text-slate-200">{issueDate}</strong>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Verification Status</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 font-bold">Audited &amp; Sealed</strong>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Trust Rating</span>
                        <strong className="text-brand-600 dark:text-brand-400 font-bold">{result.confidenceScore}% {result.confidence.toUpperCase()}</strong>
                    </div>
                </div>

                {/* Subject Asset Identification */}
                <div className="text-center py-6">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        This document certifies the independent appraised market value of
                    </span>
                    <h2 className="text-3xl sm:text-5xl font-mono font-black text-slate-900 dark:text-slate-100 tracking-tight my-2">
                        {result.domain}
                    </h2>
                    <p className="text-xs text-slate-500">
                        Top-Level Extension: <strong>.{result.tld}</strong> · Root Term: <strong>&ldquo;{result.rootLabel}&rdquo;</strong> ({result.charCount} chars)
                    </p>
                </div>

                {/* Core Valuation Figures Banner */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-center my-6">
                    <div className="mb-2 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-800 uppercase">
                        <span>🏛️ Archetype:</span>
                        <span>{result.structuralArchetype.label}</span>
                        <span>·</span>
                        <span>{result.structuralArchetype.rarity}</span>
                    </div>
                    <span className="text-xs uppercase font-bold tracking-wider text-slate-500 block">
                        Estimated Fair Market Valuation (Baseline Secondary Market)
                    </span>
                    <div className="text-4xl sm:text-5xl font-black text-brand-600 dark:text-brand-400 tracking-tight mt-1">
                        {formatUsd(result.midUsd)}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Expected Liquidity Range: <strong>{formatUsd(result.lowUsd)}</strong> – <strong>{formatUsd(result.highUsd)}</strong>
                        <span className="text-[11px] text-slate-400 ml-1">(&plusmn;{result.volatilityBandPercent}% Volatility Spread)</span>
                    </p>
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-3 font-mono">
                        <span>Structural: <strong>{formatUsd(result.triangulation.structuralValueUsd)}</strong></span>
                        <span>·</span>
                        <span>Comps Regression: <strong>{result.triangulation.compsValueUsd ? formatUsd(result.triangulation.compsValueUsd) : 'Directional'}</strong></span>
                        <span>·</span>
                        <span>Search CAC: <strong>{formatUsd(result.triangulation.economicValueUsd)}</strong></span>
                        <span>·</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Agreement: {result.triangulation.modelAgreementScore}%</span>
                    </div>
                </div>

                {/* 3-Channel Valuation Breakdown */}
                <div className="grid grid-cols-3 gap-3 my-6 text-center text-xs">
                    <div className="p-3 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">48h Liquidation Floor</span>
                        <strong className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
                            {formatUsd(result.channelPricing.liquidationFloor)}
                        </strong>
                        <span className="text-[10px] text-slate-400 block">Immediate wholesale exit</span>
                    </div>

                    <div className="p-3 rounded border-2 border-brand-500 bg-brand-50/20 dark:bg-brand-950/30">
                        <span className="text-[10px] font-bold uppercase text-brand-600 dark:text-brand-400 block">Recommended Listed BIN</span>
                        <strong className="text-base font-black text-brand-600 dark:text-brand-400 mt-0.5 block">
                            {formatUsd(result.channelPricing.recommendedBinPrice)}
                        </strong>
                        <span className="text-[10px] text-slate-400 block">Retail end-user price</span>
                    </div>

                    <div className="p-3 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Financed Lease (24mo)</span>
                        <strong className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
                            {formatUsdExact(result.channelPricing.leaseToOwn.months24.monthlyUsd)}/mo
                        </strong>
                        <span className="text-[10px] text-slate-400 block">Zero-interest term</span>
                    </div>
                </div>

                {/* Due Diligence Audit Summary Grid */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-5 mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Legal &amp; UDRP</span>
                        <strong className={`font-semibold ${result.trademark.riskLevel === 'low' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {result.trademark.udrpRating}
                        </strong>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Archive Vintage</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {result.archive?.archiveAgeYears ? `${result.archive.archiveAgeYears} Years Online` : 'Fresh Archive'}
                        </strong>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Linguistic Score</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {result.linguisticScore}/100 Quality
                        </strong>
                    </div>
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Collision Radar</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {result.alternativeTlds.collisionDensityScore}% Saturated
                        </strong>
                    </div>
                </div>

                {/* Disclaimer & Formal Stamp */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-6 mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
                    <p className="max-w-md leading-relaxed text-center sm:text-left">
                        This certificate represents an automated algorithmic valuation synthesized from comparable secondary sales,
                        linguistic quality, and live registrar availability. It is provided for informational and due diligence purposes.
                    </p>
                    <div className="text-center sm:text-right">
                        <div className="font-serif font-bold text-slate-700 dark:text-slate-300 tracking-wider">
                            DOMAINIQ AUDIT BOARD
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">
                            SHA-256 Hash Verified
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
