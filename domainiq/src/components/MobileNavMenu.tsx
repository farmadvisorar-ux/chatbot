'use client';

import { useState } from 'react';
import Link from 'next/link';

const LINKS = [
    { href: '/', label: 'Valuate Domain' },
    { href: '/compare', label: 'Domain Comparer' },
    { href: '/bulk', label: 'Bulk Portfolio Appraisal' },
    { href: '/drops', label: 'Expiring Drop Radar' },
    { href: '/extension', label: 'Browser Extension' },
    { href: '/api-docs', label: 'Developer API v1' },
    { href: '/domain-worth-calculator', label: '📖 Domain Worth Calculator Guide' },
    { href: '/suggest', label: 'Name Generator' },
    { href: '/how-it-works', label: 'Appraisal Methodology' },
    { href: '/pricing', label: 'Pricing Plans' },
];

export default function MobileNavMenu({ showDashboard }: { showDashboard: boolean }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="lg:hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle menu"
                aria-expanded={open}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/80 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
            >
                {open ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M3 12h18M3 18h18" />
                    </svg>
                )}
            </button>

            {open && (
                <div className="absolute inset-x-0 top-full border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl px-4 py-4 shadow-2xl z-50">
                    <nav className="flex flex-col gap-1 text-sm font-medium text-slate-300">
                        {LINKS.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                onClick={() => setOpen(false)}
                                className="rounded-lg px-3 py-2.5 hover:bg-slate-900 hover:text-brand-400 transition-colors"
                            >
                                {l.label}
                            </Link>
                        ))}
                        {showDashboard && (
                            <Link
                                href="/dashboard"
                                onClick={() => setOpen(false)}
                                className="rounded-lg px-3 py-2.5 bg-brand-950/60 text-brand-300 border border-brand-800/40 hover:bg-brand-900/60 transition-colors font-semibold"
                            >
                                📊 Portfolio Dashboard
                            </Link>
                        )}
                    </nav>
                </div>
            )}
        </div>
    );
}
