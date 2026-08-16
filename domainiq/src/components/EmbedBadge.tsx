'use client';

import { useState } from 'react';

export default function EmbedBadge({ domain }: { domain: string }) {
    const [copied, setCopied] = useState<'html' | 'markdown' | null>(null);

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const badgeUrl = `${baseUrl}/api/badge/${encodeURIComponent(domain)}`;
    const reportUrl = `${baseUrl}/valuation/${encodeURIComponent(domain)}`;
    const htmlSnippet = `<a href="${reportUrl}"><img src="${badgeUrl}" alt="${domain} valuation on DomainIQ"></a>`;
    const markdownSnippet = `[![${domain} valuation](${badgeUrl})](${reportUrl})`;

    async function copy(text: string, which: 'html' | 'markdown') {
        await navigator.clipboard.writeText(text);
        setCopied(which);
        setTimeout(() => setCopied(null), 2000);
    }

    return (
        <section className="card p-8">
            <h2 className="mb-1 text-xl font-semibold">Embed this score</h2>
            <p className="mb-4 text-sm text-slate-500">
                Selling this domain? Drop this badge on your landing page — it links back to the full report and
                stays current automatically.
            </p>
            <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={badgeUrl} alt={`${domain} valuation badge`} className="h-6" />
            </div>
            <div className="space-y-3">
                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">HTML</span>
                        <button onClick={() => copy(htmlSnippet, 'html')} className="text-xs text-brand-600 hover:underline">
                            {copied === 'html' ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <code className="block overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">{htmlSnippet}</code>
                </div>
                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Markdown</span>
                        <button onClick={() => copy(markdownSnippet, 'markdown')} className="text-xs text-brand-600 hover:underline">
                            {copied === 'markdown' ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <code className="block overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">{markdownSnippet}</code>
                </div>
            </div>
        </section>
    );
}
