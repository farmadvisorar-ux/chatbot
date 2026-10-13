'use client';

import { useState } from 'react';
import { formatUsd } from '@/lib/format';
import type { ChannelPricing } from '@/lib/valuation/channel-pricing';

interface Props {
    channelPricing: ChannelPricing;
    domain: string;
}

export default function LeaseCalculatorWidget({ channelPricing, domain }: Props) {
    const [term, setTerm] = useState<'12' | '24' | '36'>('24');

    const lto = channelPricing.leaseToOwn;
    const selected = term === '12' ? lto.months12 : term === '24' ? lto.months24 : lto.months36;

    const binPrice = channelPricing.recommendedBinPrice;
    const estimatedDownPayment = Math.round(binPrice * 0.1);

    return (
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono font-bold px-2 py-0.5 rounded">
                            INTERACTIVE FINANCING
                        </span>
                        <h3 className="font-bold text-base text-white">Lease-to-Own (LTO) Modeling</h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Model buyer financing plans to close deals faster on Dan, Escrow.com, or Squadhelp.
                    </p>
                </div>

                {/* Term Switcher */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
                    <button
                        type="button"
                        onClick={() => setTerm('12')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                            term === '12'
                                ? 'bg-brand-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        12 Mo
                    </button>
                    <button
                        type="button"
                        onClick={() => setTerm('24')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                            term === '24'
                                ? 'bg-brand-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        24 Mo (Recommended)
                    </button>
                    <button
                        type="button"
                        onClick={() => setTerm('36')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                            term === '36'
                                ? 'bg-brand-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        36 Mo
                    </button>
                </div>
            </div>

            {/* Calculations Grid */}
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
                        Monthly Installment
                    </span>
                    <p className="text-2xl font-black text-emerald-400 font-mono mt-1">
                        {formatUsd(selected.monthlyUsd)}
                        <span className="text-xs text-slate-500 font-sans font-normal"> / mo</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Direct buyer monthly billing</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
                        Total Payout Over {term} Mo
                    </span>
                    <p className="text-2xl font-black text-white font-mono mt-1">
                        {formatUsd(selected.totalUsd)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Includes built-in financing premium</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
                        Standard Down Payment
                    </span>
                    <p className="text-2xl font-black text-brand-300 font-mono mt-1">
                        {formatUsd(estimatedDownPayment)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Typical 10% day-one commitment</p>
                </div>
            </div>

            {/* Seller Action Bar */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs border-t border-slate-800/80">
                <div className="text-slate-400">
                    💡 <strong>Investor Tip:</strong> Offering a {term}-month installment plan on <strong className="text-slate-200">{domain}</strong> expands your buyer pool to funded startups.
                </div>
                <a
                    href={`https://dan.com/buy-domain/${encodeURIComponent(domain)}`}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="btn-secondary !py-1.5 !px-3 text-xs font-semibold shrink-0"
                >
                    Setup Dan.com LTO Page →
                </a>
            </div>
        </div>
    );
}
