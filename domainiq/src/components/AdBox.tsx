'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AdSlotData } from '@/lib/admin-data';

interface Props {
    slotId: 1 | 2 | 3 | 4;
    variant?: 'billboard' | 'showcase' | 'tile' | 'banner';
    className?: string;
    initialData?: AdSlotData;
}

export default function AdBox({
    slotId,
    variant = 'banner',
    className = '',
    initialData,
}: Props) {
    const [slot, setSlot] = useState<AdSlotData | null>(initialData ?? null);
    const [loading, setLoading] = useState(!initialData);

    useEffect(() => {
        if (!initialData) {
            fetch('/api/admin/ads')
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    if (data?.slots) {
                        const target = data.slots.find((s: AdSlotData) => s.id === slotId);
                        if (target) setSlot(target);
                    }
                })
                .catch(() => {
                    // Fall back gracefully
                })
                .finally(() => setLoading(false));
        }
    }, [slotId, initialData]);

    if (loading) {
        return (
            <div className={`rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 animate-pulse min-h-[90px] ${className}`}>
                <div className="h-4 w-28 bg-slate-800 rounded mb-2" />
                <div className="h-3 w-48 bg-slate-800/60 rounded" />
            </div>
        );
    }

    // Available / Unreserved Ad Slot State
    if (!slot || !slot.is_active) {
        return (
            <div
                className={`rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/30 p-4 sm:p-5 text-center relative overflow-hidden group hover:border-brand-500/50 transition-all ${className}`}
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold uppercase tracking-wider text-brand-400 bg-brand-950/80 border border-brand-800/80 px-2 py-0.5 rounded">
                                Ad Box #{slotId} Open
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">100% Target Investor Reach</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-200">
                            Promote Your Domain Marketplace, Brokerage, or SaaS Here
                        </h4>
                        <p className="text-xs text-slate-400">
                            Reach 50,000+ founders, investors, and domain portfolio owners every month.
                        </p>
                    </div>

                    <div className="shrink-0">
                        <Link
                            href={`/advertise?slot=${slotId}`}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-slate-800 hover:bg-brand-600 text-slate-200 hover:text-white border border-slate-700 hover:border-brand-500 transition-all shadow"
                        >
                            Reserve This Slot →
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const clickUrl = `/api/ads/click/${slot.id}`;

    // Billboard Variant (Top of Page / Header Hero)
    if (variant === 'billboard') {
        return (
            <div
                className={`rounded-2xl border border-brand-500/40 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-5 sm:p-6 relative overflow-hidden shadow-xl hover:border-brand-400/80 transition-all group ${className}`}
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="flex items-start gap-4">
                        {slot.image_url ? (
                            <img
                                src={slot.image_url}
                                alt={slot.sponsor_name}
                                className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0 shadow-md"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center text-white font-mono font-bold text-base shadow-md shrink-0">
                                📢
                            </div>
                        )}
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-950 text-brand-300 border border-brand-800">
                                    {slot.badge || 'Sponsored'}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">{slot.sponsor_name}</span>
                            </div>
                            <h3 className="text-base sm:text-lg font-black text-white tracking-tight group-hover:text-brand-200 transition-colors">
                                {slot.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                                {slot.description}
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                        <a
                            href={clickUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-bold uppercase tracking-wider bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/25 transition-all group-hover:scale-105"
                        >
                            {slot.cta_text || 'Learn More →'}
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // Showcase Variant (Inside Valuation Reports)
    if (variant === 'showcase') {
        return (
            <div
                className={`card p-6 sm:p-7 rounded-2xl border-2 border-indigo-500/30 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/20 relative overflow-hidden shadow-xl ${className}`}
            >
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">💎</span>
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                {slot.badge || 'Featured Partner'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{slot.sponsor_name}</span>
                        </div>
                        <h4 className="text-base sm:text-lg font-bold text-white tracking-tight">
                            {slot.title}
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                            {slot.description}
                        </p>
                    </div>

                    <div className="shrink-0">
                        <a
                            href={clickUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 transition-all"
                        >
                            {slot.cta_text || 'Visit Partner →'}
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    // Tile Variant (Card / Sidebar / Column Placement)
    if (variant === 'tile') {
        return (
            <div
                className={`card p-5 rounded-xl border border-cyan-500/30 bg-gradient-to-b from-slate-900 to-slate-950 relative overflow-hidden shadow-lg flex flex-col justify-between ${className}`}
            >
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            {slot.badge || 'Featured Tool'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{slot.sponsor_name}</span>
                    </div>
                    <h5 className="text-sm font-bold text-white">
                        {slot.title}
                    </h5>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        {slot.description}
                    </p>
                </div>
                <div className="pt-4">
                    <a
                        href={clickUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="w-full inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-cyan-600 hover:bg-cyan-500 text-white shadow transition-all"
                    >
                        {slot.cta_text || 'Explore →'}
                    </a>
                </div>
            </div>
        );
    }

    // Default Banner Variant (Footer, Sidebar, Standard Placements)
    return (
        <div
            className={`rounded-xl border border-slate-700/80 bg-slate-900/90 p-4 sm:p-5 relative overflow-hidden shadow-md my-4 ${className}`}
        >
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                            {slot.badge || 'Sponsor'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{slot.sponsor_name}</span>
                    </div>
                    <h5 className="text-sm font-bold text-white">
                        {slot.title}
                    </h5>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                        {slot.description}
                    </p>
                </div>

                <div className="shrink-0 pt-2 sm:pt-0">
                    <a
                        href={clickUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-brand-600 hover:bg-brand-500 text-white transition-all shadow-sm"
                    >
                        {slot.cta_text || 'Learn More →'}
                    </a>
                </div>
            </div>
        </div>
    );
}
