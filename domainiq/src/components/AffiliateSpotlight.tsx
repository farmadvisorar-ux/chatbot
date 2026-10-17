'use client';

import { useState, useEffect, useMemo } from 'react';
import { AFFILIATE_PARTNERS, getAffiliatePartner, type AffiliatePartner } from '@/config/affiliates';

interface Props {
    domain: string;
    slotIndex?: number;
    partnerId?: string;
    variant?: 'featured' | 'inline' | 'banner';
    className?: string;
}

const THEME_STYLES: Record<AffiliatePartner['theme'], {
    border: string;
    bg: string;
    badge: string;
    glow: string;
    button: string;
}> = {
    brand: {
        border: 'border-brand-500/40 hover:border-brand-400',
        bg: 'from-slate-900 via-brand-950/30 to-slate-900',
        badge: 'bg-brand-950 text-brand-300 border-brand-800',
        glow: 'bg-brand-500/10',
        button: 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/20',
    },
    emerald: {
        border: 'border-emerald-500/40 hover:border-emerald-400',
        bg: 'from-slate-900 via-emerald-950/30 to-slate-900',
        badge: 'bg-emerald-950 text-emerald-300 border-emerald-800',
        glow: 'bg-emerald-500/10',
        button: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20',
    },
    cyan: {
        border: 'border-cyan-500/40 hover:border-cyan-400',
        bg: 'from-slate-900 via-cyan-950/30 to-slate-900',
        badge: 'bg-cyan-950 text-cyan-300 border-cyan-800',
        glow: 'bg-cyan-500/10',
        button: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20',
    },
    indigo: {
        border: 'border-indigo-500/40 hover:border-indigo-400',
        bg: 'from-slate-900 via-indigo-950/30 to-slate-900',
        badge: 'bg-indigo-950 text-indigo-300 border-indigo-800',
        glow: 'bg-indigo-500/10',
        button: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20',
    },
    amber: {
        border: 'border-amber-500/40 hover:border-amber-400',
        bg: 'from-slate-900 via-amber-950/30 to-slate-900',
        badge: 'bg-amber-950 text-amber-300 border-amber-800',
        glow: 'bg-amber-500/10',
        button: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20',
    },
};

export default function AffiliateSpotlight({
    domain,
    slotIndex = 0,
    partnerId,
    variant = 'inline',
    className = '',
}: Props) {
    const [mounted, setMounted] = useState(false);
    const [clientOffset, setClientOffset] = useState(0);

    useEffect(() => {
        setMounted(true);
        // Randomize partner offset per visit/render so offers dynamically rotate across visits
        setClientOffset(Math.floor(Math.random() * AFFILIATE_PARTNERS.length));
    }, []);

    const partner = useMemo(() => {
        if (partnerId) {
            return AFFILIATE_PARTNERS.find((p) => p.id === partnerId) ?? AFFILIATE_PARTNERS[0]!;
        }
        const effectiveOffset = mounted ? slotIndex + clientOffset : slotIndex;
        return getAffiliatePartner(domain || 'domain.com', effectiveOffset) ?? AFFILIATE_PARTNERS[0]!;
    }, [domain, slotIndex, partnerId, mounted, clientOffset]);

    const theme = (partner && THEME_STYLES[partner.theme]) ? THEME_STYLES[partner.theme] : THEME_STYLES.brand;
    const safeDomain = domain || 'domain.com';

    if (variant === 'banner') {
        return (
            <div
                className={`rounded-2xl border ${theme.border} bg-gradient-to-r ${theme.bg} p-4 sm:p-5 relative overflow-hidden transition-all shadow-lg ${className}`}
            >
                <div className={`absolute top-0 right-0 w-48 h-48 ${theme.glow} rounded-full blur-2xl pointer-events-none`} />

                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-base">{partner.icon}</span>
                            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${theme.badge}`}>
                                {partner.badge}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">Sponsored Partner</span>
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                            {partner.headline(safeDomain)}
                        </h4>
                        <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                            {partner.description(safeDomain)}
                        </p>
                    </div>

                    <div className="shrink-0">
                        <a
                            href={partner.affiliateUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className={`inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md ${theme.button}`}
                        >
                            {partner.ctaText}
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    if (variant === 'featured') {
        return (
            <div
                className={`card p-6 sm:p-8 rounded-2xl border-2 ${theme.border} bg-gradient-to-b ${theme.bg} relative overflow-hidden transition-all shadow-xl ${className}`}
            >
                <div className={`absolute top-0 right-0 w-64 h-64 ${theme.glow} rounded-full blur-3xl pointer-events-none`} />

                <div className="relative z-10 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">{partner.icon}</span>
                            <span className={`text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${theme.badge}`}>
                                {partner.badge}
                            </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                            Recommended Action for {safeDomain}
                        </span>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-lg sm:text-2xl font-black text-white tracking-tight">
                            {partner.headline(safeDomain)}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                            {partner.description(safeDomain)}
                        </p>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center gap-3">
                        <a
                            href={partner.affiliateUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className={`inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-bold uppercase tracking-wider transition-all shadow-lg ${theme.button}`}
                        >
                            {partner.ctaText}
                        </a>
                        <span className="text-[11px] text-slate-500 font-mono">
                            Verified secure partner · Fast checkout
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // Default 'inline' variant: seamlessly placed within explanatory sections
    return (
        <div
            className={`rounded-xl border ${theme.border} bg-slate-900/80 p-4 sm:p-5 relative overflow-hidden transition-all shadow-md my-4 ${className}`}
        >
            <div className={`absolute top-0 right-0 w-32 h-32 ${theme.glow} rounded-full blur-xl pointer-events-none`} />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">{partner.icon}</span>
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${theme.badge}`}>
                            {partner.badge}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Partner Spotlight</span>
                    </div>
                    <h5 className="text-sm font-bold text-white">
                        {partner.headline(safeDomain)}
                    </h5>
                    <p className="text-xs text-slate-300 leading-relaxed">
                        {partner.description(safeDomain)}
                    </p>
                </div>

                <div className="shrink-0 pt-2 sm:pt-0">
                    <a
                        href={partner.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className={`inline-flex items-center justify-center px-3.5 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-sm ${theme.button}`}
                    >
                        {partner.ctaText}
                    </a>
                </div>
            </div>
        </div>
    );
}
