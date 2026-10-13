import Link from 'next/link';
import NewsletterSignup from './NewsletterSignup';

const MARKETPLACES = [
    { name: 'Sedo', href: 'https://sedo.com', blurb: 'Largest international domain marketplace' },
    { name: 'Afternic', href: 'https://afternic.com', blurb: "GoDaddy's premium global distribution network" },
    { name: 'Dan.com', href: 'https://dan.com', blurb: 'Zero-hassle escrow & lease-to-own checkout' },
];

export default function Footer() {
    return (
        <footer className="border-t border-slate-800/80 bg-slate-950 mt-24">
            {/* Newsletter Banner */}
            <div className="mx-auto max-w-6xl px-4 pt-10">
                <div className="card flex flex-col gap-5 p-6 sm:p-8 sm:flex-row sm:items-center sm:justify-between border-brand-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-brand-500/20 text-brand-300 font-mono font-bold px-2 py-0.5 rounded border border-brand-500/30">
                                DOMAINIQ DISPATCH
                            </span>
                        </div>
                        <h3 className="font-bold text-lg text-white">Private Domain Intelligence</h3>
                        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                            High-value sales alerts, expiring drop picks, and valuation model updates — zero spam.
                        </p>
                    </div>
                    <NewsletterSignup />
                </div>
            </div>

            {/* Links Grid */}
            <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-2 md:grid-cols-4 text-xs">
                {/* Brand Column */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 font-black text-lg text-white">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 text-white font-mono text-xs shadow-md shadow-brand-500/30">
                            IQ
                        </span>
                        Domain<span className="text-brand-400">IQ</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                        Deterministic domain valuation terminal. Transparent multi-tier models, real reported sales comps, and automated due diligence.
                    </p>
                    {/* Live System Status Indicator */}
                    <div className="flex items-center gap-2 pt-2 text-[11px] font-mono text-emerald-400">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span>All 6 Valuation Models Operational</span>
                    </div>
                </div>

                {/* Product Column */}
                <div>
                    <h4 className="mb-3 font-bold uppercase tracking-wider text-slate-300">Terminal Tools</h4>
                    <ul className="space-y-2 text-slate-400">
                        <li><Link href="/" className="hover:text-brand-400 transition-colors">Instant Domain Valuation</Link></li>
                        <li><Link href="/compare" className="hover:text-brand-400 transition-colors">Head-to-Head Comparer</Link></li>
                        <li><Link href="/bulk" className="hover:text-brand-400 transition-colors">Bulk Portfolio Appraisal</Link></li>
                        <li><Link href="/drops" className="hover:text-brand-400 transition-colors">Expiring Drop Radar</Link></li>
                        <li><Link href="/extension" className="hover:text-brand-400 transition-colors">Chrome &amp; Edge Extension</Link></li>
                        <li><Link href="/api-docs" className="hover:text-brand-400 transition-colors">Developer REST API v1</Link></li>
                        <li><Link href="/dashboard" className="hover:text-brand-400 transition-colors">Portfolio Watchlist &amp; Alerts</Link></li>
                    </ul>
                </div>

                {/* Secondary Market Channels */}
                <div>
                    <h4 className="mb-3 font-bold uppercase tracking-wider text-slate-300">Marketplace Liquidity</h4>
                    <ul className="space-y-2 text-slate-400">
                        {MARKETPLACES.map((m) => (
                            <li key={m.name}>
                                <a href={m.href} target="_blank" rel="noopener noreferrer sponsored" className="hover:text-brand-400 transition-colors flex items-center justify-between group">
                                    <span>List on {m.name}</span>
                                    <span className="text-slate-600 group-hover:text-brand-400 transition-colors">→</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-[10px] text-slate-500 leading-normal">
                        Affiliate partners — DomainIQ may earn referral consideration at no cost to buyers or sellers.
                    </p>
                </div>

                {/* Methodology & Legal */}
                <div>
                    <h4 className="mb-3 font-bold uppercase tracking-wider text-slate-300">Documentation</h4>
                    <ul className="space-y-2 text-slate-400">
                        <li><Link href="/how-it-works" className="hover:text-brand-400 transition-colors">Pricing Algorithm &amp; Comps</Link></li>
                        <li><Link href="/pricing" className="hover:text-brand-400 transition-colors">Account Tiers &amp; Quotas</Link></li>
                        <li><Link href="/suggest" className="hover:text-brand-400 transition-colors">Brandable Name Generator</Link></li>
                    </ul>
                </div>
            </div>

            {/* Bottom Copyright Bar */}
            <div className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
                <p>© {new Date().getFullYear()} DomainIQ Inc. Algorithmic estimates for informational decision intelligence, not guaranteed appraisal warrants.</p>
            </div>
        </footer>
    );
}
