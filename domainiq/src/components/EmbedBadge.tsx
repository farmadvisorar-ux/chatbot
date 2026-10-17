'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function EmbedBadge({ domain }: { domain: string }) {
    const [style, setStyle] = useState<'pill' | 'card'>('card');
    const [copied, setCopied] = useState<'html' | 'markdown' | 'url' | null>(null);

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const badgeUrl = `${baseUrl}/api/badge/${encodeURIComponent(domain)}${style === 'card' ? '?style=card' : ''}`;
    const reportUrl = `${baseUrl}/valuation/${encodeURIComponent(domain)}`;
    const certificateUrl = `${reportUrl}/certificate`;

    const htmlSnippet = `<a href="${reportUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeUrl}" alt="${domain} valuation on DomainIQ" /></a>`;
    const markdownSnippet = `[![${domain} valuation](${badgeUrl})](${reportUrl})`;

    async function copy(text: string, which: 'html' | 'markdown' | 'url') {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(which);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            // fallback
        }
    }

    return (
        <section className="card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Embed Valuation Badge &amp; Certificate</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Selling this domain? Drop a real-time badge on your landing page, portfolio, or marketplace listing.
                    </p>
                </div>
                <Link
                    href={certificateUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-brand-500/30 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:hover:bg-brand-900/50 dark:text-brand-300 text-xs font-semibold shrink-0 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Printable Appraisal Certificate →
                </Link>
            </div>

            {/* Badge Style Switcher */}
            <div className="flex items-center gap-2 mb-6 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg w-fit border border-slate-200 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => setStyle('card')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        style === 'card'
                            ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                    Showcase Card (Recommended)
                </button>
                <button
                    type="button"
                    onClick={() => setStyle('pill')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        style === 'pill'
                            ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                    Compact Pill Badge
                </button>
            </div>

            {/* Badge Live Preview */}
            <div className="mb-6 p-6 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-center min-h-[140px] overflow-x-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={badgeUrl}
                    alt={`${domain} valuation badge`}
                    className={style === 'card' ? 'w-[380px] max-w-full rounded-xl shadow-lg' : 'h-6'}
                />
            </div>

            {/* Code Snippets */}
            <div className="space-y-4">
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">HTML Embed</span>
                        <button
                            onClick={() => copy(htmlSnippet, 'html')}
                            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                        >
                            {copied === 'html' ? '✓ Copied to clipboard!' : 'Copy snippet'}
                        </button>
                    </div>
                    <code className="block overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs font-mono text-slate-800 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                        {htmlSnippet}
                    </code>
                </div>

                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Markdown (GitHub / Forum)</span>
                        <button
                            onClick={() => copy(markdownSnippet, 'markdown')}
                            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                        >
                            {copied === 'markdown' ? '✓ Copied to clipboard!' : 'Copy snippet'}
                        </button>
                    </div>
                    <code className="block overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs font-mono text-slate-800 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                        {markdownSnippet}
                    </code>
                </div>
            </div>
        </section>
    );
}
