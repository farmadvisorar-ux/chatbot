import Link from 'next/link';
import DomainCheckerForm from '@/components/DomainCheckerForm';
import AdSlot from '@/components/AdSlot';

const PILLARS = [
    {
        icon: '📊',
        title: 'Multi-Channel Pricing Matrix',
        subtitle: '4 Realities, Not 1 Guess',
        description:
            'Most tools show one arbitrary number. DomainIQ calculates retail Fair Market Value, wholesale investor spread, immediate liquidation floor, and 12-36mo lease-to-own financing.',
        badge: 'Institutional Matrix',
    },
    {
        icon: '⚖️',
        title: 'Automated UDRP & IP Radar',
        subtitle: 'Legal Due Diligence Built-In',
        description:
            'Screen names against famous marks, WIPO dispute precedents, typosquatting vectors, and live USPTO records to avoid costly trademark forfeiture.',
        badge: 'Pre-Bid Protection',
    },
    {
        icon: '🏛️',
        title: 'Wayback Machine Archive Forensics',
        subtitle: 'Continuous Online Vintage',
        description:
            'Audits historical snapshots from 1996 to present. Flags high-risk drop gaps, expired domain re-registrations, and dormant gaps that erode SEO trust.',
        badge: 'Provenance Audit',
    },
    {
        icon: '⚡',
        title: 'Real Comparable Sales Anchoring',
        subtitle: '14.8M+ Verified Transactions',
        description:
            'Calculations are mathematically grounded against verified aftermarket sales (Sedo, NameBio, DNJournal) via similarity-weighted linguistic and phonetic clustering.',
        badge: 'Ground Truth Data',
    },
    {
        icon: '🌐',
        title: 'Alternative Extension Collision Radar',
        subtitle: 'Commercial Brand Scarcity',
        description:
            'Audits whether the root label is active on .com, .ai, .io, .org, and .net to gauge corporate buyer urgency and defensibility.',
        badge: 'Scarcity Index',
    },
    {
        icon: '📄',
        title: 'Formal Printable Appraisal Certificates',
        subtitle: 'Escrow & Financing Ready',
        description:
            'Export official valuation certificates complete with verification IDs, cryptographic hashes, and print-ready formatting for lenders and buyers.',
        badge: 'Deal Ready',
    },
];

const CURATED_SHOWCASE = [
    { domain: 'insurance.com', fmv: '$35,600,000', floor: '$4,272,000', rating: 'Ultra-Liquid', tier: 'AAA+' },
    { domain: 'voice.com', fmv: '$30,000,000', floor: '$3,600,000', rating: 'Ultra-Liquid', tier: 'AAA+' },
    { domain: 'ai.com', fmv: '$11,000,000', floor: '$1,320,000', rating: 'Ultra-Liquid', tier: 'AAA+' },
    { domain: 'cloudscale.ai', fmv: '$42,500', floor: '$9,200', rating: 'High Liquidity', tier: 'A' },
];

export default function HomePage() {
    return (
        <div className="space-y-20 py-4 sm:py-8">
            {/* Hero Section */}
            <section className="text-center space-y-6 relative">
                {/* Ambient Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-brand-600/15 blur-[120px] pointer-events-none rounded-full" />

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-950/80 border border-brand-800/60 text-brand-300 text-xs font-mono font-semibold shadow-inner">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                    </span>
                    <span>100% Free · No Email Capture · Institutional Engine</span>
                </div>

                <h1 className="mx-auto max-w-4xl text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
                    What is your domain{' '}
                    <span className="bg-gradient-to-r from-brand-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
                        actually worth?
                    </span>
                </h1>

                <p className="mx-auto max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
                    Stop relying on opaque black boxes. Get an instant, fully explainable valuation backed by real comparable sales, multi-channel pricing spreads, and automated legal due diligence.
                </p>

                {/* Search Bar Console */}
                <div className="mx-auto max-w-2xl pt-2">
                    <DomainCheckerForm />
                </div>

                {/* SEO & LLM Authoritative Guide Pillar Callout */}
                <div className="mx-auto max-w-2xl pt-2">
                    <Link
                        href="/domain-worth-calculator"
                        className="group flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-brand-950/40 to-indigo-950/40 border border-brand-500/30 hover:border-brand-400 shadow-lg shadow-brand-500/5 transition-all text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300 text-lg border border-brand-500/30">
                                📖
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded font-bold border border-cyan-800/80">
                                        Pricing Framework
                                    </span>
                                    <span className="text-xs text-slate-400 font-mono">2026 Guide</span>
                                </div>
                                <p className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white transition-colors mt-0.5">
                                    How Much Is My Domain Name Worth Calculator: An Exact Pricing Framework
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-semibold text-brand-400 group-hover:text-brand-300 flex items-center gap-1 font-mono whitespace-nowrap self-end sm:self-auto">
                            Read Guide →
                        </span>
                    </Link>
                </div>
            </section>

            {/* Quick Live Comps Showcase Carousel */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span>📌</span> Benchmark Appraisals
                        </h2>
                        <p className="text-xs text-slate-400">Sample valuations generated by the DomainIQ algorithm</p>
                    </div>
                    <Link href="/how-it-works" className="text-xs text-brand-400 hover:text-brand-300 font-semibold font-mono">
                        Methodology breakdown →
                    </Link>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {CURATED_SHOWCASE.map((item) => (
                        <Link
                            key={item.domain}
                            href={`/valuation/${encodeURIComponent(item.domain)}`}
                            className="card p-5 group hover:border-brand-500/50 hover:bg-slate-900 transition-all flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center justify-between text-xs mb-2">
                                    <span className="font-mono text-slate-400">{item.rating}</span>
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                                        {item.tier}
                                    </span>
                                </div>
                                <h3 className="font-bold text-base text-white group-hover:text-brand-300 transition-colors font-mono">
                                    {item.domain}
                                </h3>
                                <p className="mt-3 text-2xl font-black text-emerald-400 font-mono tracking-tight">
                                    {item.fmv}
                                </p>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                                <span>Wholesale Floor: <strong className="text-slate-300">{item.floor}</strong></span>
                                <span className="text-brand-400 group-hover:translate-x-0.5 transition-transform">Inspect →</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Core Capability Pillars */}
            <section className="space-y-6">
                <div className="text-center max-w-2xl mx-auto space-y-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-brand-400">
                        Why DomainIQ Leads The Industry
                    </span>
                    <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
                        Every Signal That Governs Real Value
                    </h2>
                    <p className="text-sm text-slate-400">
                        Built for portfolio investors, startup acquirers, brokers, and founders who need transparent numbers they can defend in negotiations.
                    </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {PILLARS.map((p) => (
                        <div key={p.title} className="card p-6 flex flex-col justify-between space-y-4 hover:border-slate-700">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-3xl p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 inline-block">
                                        {p.icon}
                                    </span>
                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20">
                                        {p.badge}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-white">{p.title}</h3>
                                    <p className="text-xs text-brand-400 font-mono">{p.subtitle}</p>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">{p.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Platform Stats Grid */}
            <section className="card p-8 sm:p-10 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/50 border-brand-500/20">
                <div className="grid gap-8 sm:grid-cols-4 text-center">
                    <div className="space-y-1">
                        <div className="text-3xl sm:text-4xl font-black text-brand-400 font-mono">$35.6M</div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Highest Recorded Comp</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-3xl sm:text-4xl font-black text-brand-400 font-mono">14.8M+</div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Sales Records Indexed</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-3xl sm:text-4xl font-black text-brand-400 font-mono">6 Models</div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Algorithmic Layers</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-3xl sm:text-4xl font-black text-brand-400 font-mono">&lt; 50ms</div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Evaluation Latency</p>
                    </div>
                </div>
            </section>

            <AdSlot slotId={1} variant="billboard" className="mx-auto max-w-4xl my-8" />

            {/* Bottom Call to Action */}
            <section className="card p-8 sm:p-12 text-center space-y-6 relative overflow-hidden border-brand-500/30">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                    Appraise your domain portfolio now
                </h2>
                <p className="text-sm text-slate-400 max-w-xl mx-auto">
                    Evaluate individual domains with complete breakdowns or batch-process up to 200 domains with our bulk portfolio financial calculator.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link href="/bulk" className="btn-primary text-xs font-bold px-6 py-3">
                        Launch Bulk Portfolio Engine →
                    </Link>
                    <Link href="/drops" className="btn-secondary text-xs font-bold px-5 py-3">
                        Explore Drop Radar
                    </Link>
                    <Link href="/extension" className="btn-secondary text-xs font-bold px-5 py-3">
                        Install Chrome Extension
                    </Link>
                </div>
            </section>
        </div>
    );
}
