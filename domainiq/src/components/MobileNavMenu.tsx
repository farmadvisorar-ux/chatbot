'use client';

import { useState } from 'react';
import Link from 'next/link';

const LINKS = [
    { href: '/', label: 'Valuate' },
    { href: '/compare', label: 'Compare' },
    { href: '/bulk', label: 'Bulk Check' },
    { href: '/suggest', label: 'Name Ideas' },
    { href: '/how-it-works', label: 'Methodology' },
    { href: '/pricing', label: 'Pricing' },
];

export default function MobileNavMenu({ showDashboard }: { showDashboard: boolean }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="md:hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle menu"
                aria-expanded={open}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
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
                <div className="absolute inset-x-0 top-full border-b border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-800 dark:bg-slate-950">
                    <nav className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                        {LINKS.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                onClick={() => setOpen(false)}
                                className="rounded-md px-2 py-2.5 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                            >
                                {l.label}
                            </Link>
                        ))}
                        {showDashboard && (
                            <Link
                                href="/dashboard"
                                onClick={() => setOpen(false)}
                                className="rounded-md px-2 py-2.5 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                            >
                                Dashboard
                            </Link>
                        )}
                    </nav>
                </div>
            )}
        </div>
    );
}
