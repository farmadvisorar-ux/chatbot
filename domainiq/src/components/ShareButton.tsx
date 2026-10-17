'use client';

import { useEffect, useRef, useState } from 'react';

export default function ShareButton({ domain, priceLabel }: { domain: string; priceLabel: string }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [canNativeShare, setCanNativeShare] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        }
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const url = typeof window !== 'undefined' ? window.location.href : `https://domainiq.vercel.app/valuation/${domain}`;
    const text = `${domain} is valued at ${priceLabel} by DomainIQ — free, explainable domain valuations:`;

    async function handleShareClick() {
        if (canNativeShare) {
            try {
                // The native share sheet is itself "share to every platform" —
                // it lists whatever apps (Messages, WhatsApp, X, Mail, etc.)
                // are actually installed, rather than us hard-coding a list.
                await navigator.share({ title: `${domain} valuation`, text, url });
            } catch {
                // AbortError when the user just closes the sheet — not an error.
            }
            return;
        }
        setOpen((v) => !v);
    }

    async function copyLink() {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setOpen(false);
    }

    const links = [
        { label: 'X / Twitter', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
        { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
        { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
        { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
        { label: 'Email', href: `mailto:?subject=${encodeURIComponent(`${domain} valuation`)}&body=${encodeURIComponent(`${text}\n\n${url}`)}` },
    ];

    return (
        <div className="relative" ref={menuRef}>
            <button onClick={handleShareClick} className="btn-secondary">
                Share ↗
            </button>
            {open && !canNativeShare && (
                <div className="absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-1.5 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {links.map((l) => (
                        <a
                            key={l.label}
                            href={l.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                            onClick={() => setOpen(false)}
                        >
                            {l.label}
                        </a>
                    ))}
                    <button
                        onClick={copyLink}
                        className="block w-full rounded-md px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        {copied ? 'Copied!' : 'Copy link'}
                    </button>
                </div>
            )}
        </div>
    );
}
