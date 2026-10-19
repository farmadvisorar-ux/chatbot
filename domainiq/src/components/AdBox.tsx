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
        const slotMeta = {
            1: {
                title: 'Top Hero Billboard (728x90) • Banner Space Available',
                badge: 'Slot #1 • Top Billboard',
                price: '$499/mo',
                desc: 'Header hero exposure across homepage & search. Reach 45,000+ domain portfolio acquirers.',
            },
            2: {
                title: 'Valuation Report Showcase • Banner Space Available',
                badge: 'Slot #2 • Valuation Showcase',
                price: '$399/mo',
                desc: 'Native partner placement embedded inside high-value appraisal reports with highest buyer intent.',
            },
            3: {
                title: 'Intelligence & Calculator Tile (300x250) • Banner Space Available',
                badge: 'Slot #3 • Calculator Tile',
                price: '$299/mo',
                desc: 'Targeted placement within domain worth calculators and valuation intelligence guides.',
            },
            4: {
                title: 'Sitewide Bottom Leaderboard Banner • Banner Space Available',
                badge: 'Slot #4 • Footer Leaderboard',
                price: '$199/mo',
                desc: 'Prominent horizontal banner displayed above footer across every single page on DomainIQ.',
            },
        }[slotId];

        return (
            <div
                className={`rounded-2xl border-2 border-dashed border-brand-500/30 bg-gradient-to-r from-slate-900/90 via-indigo-950/20 to-slate-900/90 p-4 sm:p-5 relative overflow-hidden group hover:border-brand-500/70 transition-all ${className}`}
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-brand-300 bg-brand-950/90 border border-brand-800 px-2 py-0.5 rounded shadow-sm">
                                📢 {slotMeta.badge}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded">
                                {slotMeta.price}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
                                • Available for Purchase
                            </span>
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-brand-200 transition-colors">
                            {slotMeta.title}
                        </h4>
                        <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                            {slotMeta.desc}
                        </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-3">
                        <Link
                            href={`/advertise?slot=${slotId}`}
                            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white border border-brand-400/30 transition-all shadow-lg shadow-brand-500/20 group-hover:scale-105 whitespace-nowrap"
                        >
                            Place Your Banner Here →
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
                                className="w-16 h-16 rounded-xl object-cover border border-slate-700 shrink-0 shadow-md bg-slate-950"
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
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-bold uppercase tracking-wider bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/25 transition-all group-hover:scale-105 whitespace-nowrap"
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
                className={`card p-6 sm:p-7 rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/30 relative overflow-hidden shadow-xl ${className}`}
            >
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-start gap-4">
                        {slot.image_url ? (
                            <img
                                src={slot.image_url}
                                alt={slot.sponsor_name}
                                className="w-14 h-14 rounded-xl object-cover border border-indigo-700/60 shrink-0 shadow-md bg-slate-950"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-lg shrink-0 shadow-md">
                                💎
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
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
                    </div>

                    <div className="shrink-0">
                        <a
                            href={clickUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 transition-all whitespace-nowrap"
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
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            {slot.badge || 'Featured Tool'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{slot.sponsor_name}</span>
                    </div>

                    {slot.image_url && (
                        <div className="w-full h-24 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                            <img
                                src={slot.image_url}
                                alt={slot.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <div>
                        <h5 className="text-sm font-bold text-white">
                            {slot.title}
                        </h5>
                        <p className="text-xs text-slate-400 leading-relaxed mt-1">
                            {slot.description}
                        </p>
                    </div>
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
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                    {slot.image_url ? (
                        <img
                            src={slot.image_url}
                            alt={slot.sponsor_name}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0 bg-slate-950"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-base shrink-0">
                            📢
                        </div>
                    )}
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
                </div>

                <div className="shrink-0 pt-2 sm:pt-0">
                    <a
                        href={clickUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-brand-600 hover:bg-brand-500 text-white transition-all shadow-sm whitespace-nowrap"
                    >
                        {slot.cta_text || 'Learn More →'}
                    </a>
                </div>
            </div>
        </div>
    );
}
