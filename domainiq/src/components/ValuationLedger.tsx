'use client';

import { useState } from 'react';
import { formatUsd } from '@/lib/format';
import type { ValuationLedgerItem } from '@/lib/valuation/engine';

interface Props {
    ledger: ValuationLedgerItem[];
    consensusFmvUsd: number;
    domain: string;
}

const CATEGORY_ICONS: Record<string, string> = {
    scarcity: '🏛️',
    linguistics: '🎙️',
    commercial: '💼',
    traffic: '📈',
    provenance: '📜',
    defensive: '🛡️',
    risk: '⚖️',
};

export default function ValuationLedger({ ledger, consensusFmvUsd, domain }: Props) {
    const [copied, setCopied] = useState(false);

    function handleCopy() {
        const text = [
            `DOMAINIQ AUDITED VALUATION LEDGER FOR ${domain.toUpperCase()}`,
            `Consensus Fair Market Value: $${consensusFmvUsd.toLocaleString()}`,
            '----------------------------------------',
            ...ledger.map((item) => {
                const sign = item.impact === 'credit' ? '+' : item.impact === 'debit' ? '-' : '=';
                return `${sign} $${item.amountUsd.toLocaleString()} | ${item.label} (${item.description})`;
            }),
            '----------------------------------------',
            `Net Certified FMV: $${consensusFmvUsd.toLocaleString()}`,
            `Source: DomainIQ Institutional Valuation Terminal (https://domainiq.app/valuation/${domain})`
        ].join('\n');

        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    }

    return (
        <section className="card p-6 sm:p-8 bg-slate-900/60 border border-slate-800 relative overflow-hidden backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-indigo-950/80 border border-indigo-800/80 text-indigo-300 font-bold">
                            XVAL Audit Statement
                        </span>
                        <h2 className="text-xl font-bold tracking-tight text-white">
                            Explainable Valuation Ledger
                        </h2>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400">
                        Itemized financial ledger displaying every algorithmic dollar credited or discounted to arrive at consensus FMV.
                    </p>
                </div>
                <button
                    onClick={handleCopy}
                    className="btn-secondary !py-1.5 !px-3 text-xs font-semibold whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5"
                >
                    <span>{copied ? '✓ Ledger Copied' : '📋 Copy Ledger Dossier'}</span>
                </button>
            </div>

            <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-slate-800 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                            <th className="pb-3 pr-4">Factor / Value Driver</th>
                            <th className="pb-3 pr-4">Financial Rationale</th>
                            <th className="pb-3 text-right">Adjustment</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                        {ledger.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                <td className="py-3.5 pr-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm shrink-0">
                                            {CATEGORY_ICONS[item.category] || '🔹'}
                                        </span>
                                        <div>
                                            <span className="font-semibold text-slate-200 block text-xs sm:text-sm">
                                                {item.label}
                                            </span>
                                            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                                                Category: {item.category}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3.5 pr-4 text-xs text-slate-400 leading-relaxed max-w-md">
                                    {item.description}
                                </td>
                                <td className="py-3.5 text-right font-mono font-bold whitespace-nowrap text-sm">
                                    {item.impact === 'credit' && (
                                        <span className="text-emerald-400">+{formatUsd(item.amountUsd)}</span>
                                    )}
                                    {item.impact === 'debit' && (
                                        <span className="text-rose-400">-{formatUsd(item.amountUsd)}</span>
                                    )}
                                    {item.impact === 'baseline' && (
                                        <span className="text-cyan-400">{formatUsd(item.amountUsd)}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-brand-500/50 bg-slate-900/90">
                            <td className="pt-4 pb-2 pr-4 font-mono font-bold text-white text-sm">
                                Net Reconciled Fair Market Value
                            </td>
                            <td className="pt-4 pb-2 pr-4 text-xs text-slate-400 font-mono">
                                Fully reconciled institutional valuation ledger
                            </td>
                            <td className="pt-4 pb-2 text-right font-mono font-black text-lg text-emerald-400">
                                {formatUsd(consensusFmvUsd)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>
    );
}
