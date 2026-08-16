import Link from 'next/link';
import NewsletterSignup from './NewsletterSignup';

const MARKETPLACES = [
    { name: 'Sedo', href: 'https://sedo.com', blurb: 'List your domain on the largest domain marketplace' },
    { name: 'Afternic', href: 'https://afternic.com', blurb: 'Sell through GoDaddy\'s premium network' },
    { name: 'Dan.com', href: 'https://dan.com', blurb: 'Buyer-friendly escrow and landing pages' },
];

export default function Footer() {
    return (
        <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 mt-24">
            <div className="mx-auto max-w-6xl px-4 pt-10">
                <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="font-semibold">Get the newsletter</h3>
                        <p className="text-sm text-slate-500">Occasional picks worth knowing about — new tools, notable domains, and more.</p>
                    </div>
                    <NewsletterSignup />
                </div>
            </div>
            <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-4">
                <div>
                    <div className="flex items-center gap-2 font-bold text-lg mb-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white text-sm">IQ</span>
                        DomainIQ
                    </div>
                    <p className="text-sm text-slate-500">Free, transparent, explainable domain valuations. No black boxes.</p>
                </div>
                <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Product</h4>
                    <ul className="space-y-1 text-sm text-slate-500">
                        <li><Link href="/" className="hover:text-brand-600">Instant valuation</Link></li>
                        <li><Link href="/compare" className="hover:text-brand-600">Compare domains</Link></li>
                        <li><Link href="/bulk" className="hover:text-brand-600">Bulk portfolio check</Link></li>
                        <li><Link href="/dashboard" className="hover:text-brand-600">Watchlist &amp; alerts</Link></li>
                    </ul>
                </div>
                <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Ready to sell?</h4>
                    <ul className="space-y-1 text-sm text-slate-500">
                        {MARKETPLACES.map((m) => (
                            <li key={m.name}>
                                <a href={m.href} target="_blank" rel="noopener noreferrer sponsored" className="hover:text-brand-600">
                                    List on {m.name} →
                                </a>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-xs text-slate-400">Affiliate links — DomainIQ may earn a referral fee at no cost to you.</p>
                </div>
                <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Company</h4>
                    <ul className="space-y-1 text-sm text-slate-500">
                        <li><Link href="/how-it-works" className="hover:text-brand-600">Methodology</Link></li>
                        <li><Link href="/pricing" className="hover:text-brand-600">Pricing</Link></li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-900 py-4 text-center text-xs text-slate-400">
                © {new Date().getFullYear()} DomainIQ. Valuations are algorithmic estimates, not appraisals or guarantees of sale price.
            </div>
        </footer>
    );
}
