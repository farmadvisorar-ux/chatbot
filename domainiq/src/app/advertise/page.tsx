'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const AD_POSITIONS = [
    {
        slotId: 1,
        name: 'Top Billboard (Hero Placement)',
        badge: 'Maximum Impact',
        location: 'Sitewide Homepage & Header Hero',
        format: 'Full-width banner with logo, headline, blurb & high-contrast CTA button',
        monthlyViews: '45,000+',
        priceUsd: 499,
        color: 'from-brand-600 to-indigo-600',
        borderColor: 'border-brand-500/40',
        bestFor: 'Domain Marketplaces, Registrars, AI SaaS, Escrow Platforms',
    },
    {
        slotId: 2,
        name: 'Valuation Report Showcase',
        badge: 'Highest Intent',
        location: 'Directly inside Domain Valuation & Appraisal Reports',
        format: 'Native featured partner showcase box with verified trust badges',
        monthlyViews: '28,000+',
        priceUsd: 399,
        color: 'from-indigo-600 to-purple-600',
        borderColor: 'border-indigo-500/40',
        bestFor: 'Domain Brokers, Outbound Acquisition Services, Legal Counsel',
    },
    {
        slotId: 3,
        name: 'Algorithmic Guide & Calculator Tile',
        badge: 'High Conversion',
        location: 'Within Masterclass Valuation Guides & Extension Calculators',
        format: 'Targeted tools grid card tile with customized headline & live button',
        monthlyViews: '22,000+',
        priceUsd: 299,
        color: 'from-cyan-600 to-blue-600',
        borderColor: 'border-cyan-500/40',
        bestFor: 'Hosting, DNS Providers, Startup Accelerators, Drop Catchers',
    },
    {
        slotId: 4,
        name: 'Sitewide Bottom Banner',
        badge: 'Broad Exposure',
        location: 'Above Footer Across Every Page on DomainIQ',
        format: 'Clean horizontal banner with sponsor badge and direct link',
        monthlyViews: '35,000+',
        priceUsd: 199,
        color: 'from-slate-700 to-slate-900',
        borderColor: 'border-slate-700',
        bestFor: 'Newsletters, Tech Products, Conferences, Developer Tools',
    },
];

function AdvertiseForm() {
    const searchParams = useSearchParams();
    const initialSlot = Number(searchParams?.get('slot')) || 1;

    const [selectedSlot, setSelectedSlot] = useState<number>(initialSlot);
    const [company, setCompany] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [destinationUrl, setDestinationUrl] = useState('');
    const [bannerImageUrl, setBannerImageUrl] = useState('');
    const [bannerTitle, setBannerTitle] = useState('');
    const [bannerDescription, setBannerDescription] = useState('');
    const [ctaText, setCtaText] = useState('Explore Offer →');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const slotParam = searchParams?.get('slot');
        if (slotParam) {
            const num = Number(slotParam);
            if (num >= 1 && num <= 4) setSelectedSlot(num);
        }
    }, [searchParams]);

    const currentPos = AD_POSITIONS.find((p) => p.slotId === selectedSlot) ?? AD_POSITIONS[0]!;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const res = await fetch('/api/admin/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slot_id: selectedSlot,
                    company,
                    advertiser_name: name || company,
                    email,
                    destination_url: destinationUrl,
                    amount_usd: currentPos?.priceUsd || 499,
                    banner_image_url: bannerImageUrl.trim() || null,
                    banner_title: bannerTitle.trim() || `${company} — Official Sponsor`,
                    banner_description: bannerDescription.trim() || `Visit ${company} for premium digital asset solutions and verified domain services.`,
                    cta_text: ctaText.trim() || 'Learn More →',
                    notes,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setSubmitted(true);
            } else {
                setError(data.error || 'Failed to submit application. Please check fields.');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="card p-8 sm:p-10 rounded-2xl border-emerald-500/40 bg-emerald-950/20 text-center space-y-4 max-w-xl mx-auto shadow-2xl">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-2xl flex items-center justify-center mx-auto">
                    ✓
                </div>
                <h3 className="text-xl font-black text-white">
                    Banner Sponsorship Reservation Received!
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                    Thank you, <span className="font-bold text-white">{company}</span>. Your reservation for <span className="font-mono text-emerald-400">Ad Box #{selectedSlot}</span> ({currentPos?.name || 'Dedicated Placement'}) has been routed directly to our admin terminal for deployment review.
                </p>
                <p className="text-xs text-slate-400 font-mono">
                    Target destination URL: <span className="text-slate-200">{destinationUrl}</span> • Contact: <span className="text-slate-200">{email}</span>. You will receive an invoice and onboarding confirmation within 24 hours.
                </p>
                <div className="pt-4 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            setSubmitted(false);
                            setCompany('');
                            setName('');
                            setEmail('');
                            setDestinationUrl('');
                            setBannerImageUrl('');
                            setBannerTitle('');
                            setBannerDescription('');
                        }}
                        className="btn-secondary text-xs font-mono px-4 py-2"
                    >
                        + Book Another Placement
                    </button>
                    <Link href="/" className="btn-primary text-xs font-mono font-bold uppercase tracking-wider px-6 py-2">
                        ← Return to DomainIQ Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="card p-6 sm:p-8 rounded-2xl border-brand-500/30 bg-slate-900/90 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                    <h3 className="text-lg font-black text-white tracking-tight">
                        Reserve Your Advertisement Banner
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                        Select one of the 4 dedicated ad boxes, customize your banner creative, and see real-time preview.
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <span className="text-xl font-black text-emerald-400 font-mono">
                        ${currentPos?.priceUsd ?? 499}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">/month</span>
                </div>
            </div>

            {error && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono">
                    ⚠ {error}
                </div>
            )}

            {/* Step 1: Choose Placement */}
            <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                    1. Select Dedicated Ad Box Placement
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AD_POSITIONS.map((pos) => (
                        <button
                            key={pos.slotId}
                            type="button"
                            onClick={() => setSelectedSlot(pos.slotId)}
                            className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                selectedSlot === pos.slotId
                                    ? 'bg-brand-950/70 border-brand-500 text-white shadow-lg shadow-brand-500/10'
                                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono font-bold text-white">
                                    Ad Box #{pos.slotId}
                                </span>
                                <span className="text-xs font-mono font-bold text-emerald-400">
                                    ${pos.priceUsd}/mo
                                </span>
                            </div>
                            <div className="text-xs font-semibold text-slate-200 mt-1">{pos.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">{pos.location}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Step 2: Company & Contact Information */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                    2. Company &amp; Contact Details
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-mono text-slate-300 block">Company / Brand Name *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Escrow.com, Sedo, Dynadot"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            className="input w-full text-xs font-mono bg-slate-950"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-mono text-slate-300 block">Contact Name *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Sarah Jenkins"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="input w-full text-xs font-mono bg-slate-950"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-mono text-slate-300 block">Business Email *</label>
                        <input
                            type="email"
                            required
                            placeholder="partnerships@yourcompany.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input w-full text-xs font-mono bg-slate-950"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-mono text-brand-300 font-bold block">
                            Live Destination URL *
                        </label>
                        <input
                            type="url"
                            required
                            placeholder="https://yourcompany.com/promo"
                            value={destinationUrl}
                            onChange={(e) => setDestinationUrl(e.target.value)}
                            className="input w-full text-xs font-mono bg-slate-950 border-brand-500/50"
                        />
                    </div>
                </div>
            </div>

            {/* Step 3: Banner Creative Configuration */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                    3. Banner Creative &amp; Marketing Copy
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-mono text-slate-300 block">
                            Banner Headline / Title *
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Secure Domain Escrow With Zero Friction"
                            value={bannerTitle}
                            onChange={(e) => setBannerTitle(e.target.value)}
                            className="input w-full text-xs bg-slate-950"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-mono text-slate-300 block">
                            CTA Button Text *
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Visit Escrow.com →"
                            value={ctaText}
                            onChange={(e) => setCtaText(e.target.value)}
                            className="input w-full text-xs font-mono bg-slate-950"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-300 block">
                        Banner Image URL (Logo or Banner Creative)
                    </label>
                    <input
                        type="url"
                        placeholder="https://yourcompany.com/assets/banner-logo.png"
                        value={bannerImageUrl}
                        onChange={(e) => setBannerImageUrl(e.target.value)}
                        className="input w-full text-xs font-mono bg-slate-950"
                    />
                    <p className="text-[10px] text-slate-500 font-mono">
                        Direct public image link (PNG, JPG, SVG). Leave blank to use a polished branded typography badge.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-300 block">
                        Banner Description / Value Proposition *
                    </label>
                    <textarea
                        rows={2}
                        required
                        placeholder="e.g. Over $5 Billion in digital assets protected. Instant wire and crypto checkout for domain buyers."
                        value={bannerDescription}
                        onChange={(e) => setBannerDescription(e.target.value)}
                        className="input w-full text-xs bg-slate-950"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-400 block">
                        Additional Campaign Notes (Optional)
                    </label>
                    <input
                        type="text"
                        placeholder="Target start date, UTM tracking tags, special instructions..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="input w-full text-xs bg-slate-950"
                    />
                </div>
            </div>

            {/* Real-time Live Banner Preview */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-brand-300">
                        ⚡ Live Banner Preview (Box #{selectedSlot})
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                        Updates as you type
                    </span>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl border border-brand-500/40 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 shadow-xl relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                            {bannerImageUrl.trim() ? (
                                <img
                                    src={bannerImageUrl.trim()}
                                    alt="Banner Preview"
                                    onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                    }}
                                    className="w-14 h-14 rounded-xl object-cover border border-slate-700 shrink-0 bg-slate-950 shadow"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-600 flex items-center justify-center text-white text-base font-bold shrink-0 shadow">
                                    📢
                                </div>
                            )}
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-brand-950 text-brand-300 border border-brand-800">
                                        Sponsored Partner
                                    </span>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                        {company || 'Your Company'}
                                    </span>
                                </div>
                                <h4 className="text-sm sm:text-base font-bold text-white">
                                    {bannerTitle || 'Your Compelling Headline Here'}
                                </h4>
                                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                                    {bannerDescription || 'Your targeted promotional message will appear here, viewed by 50,000+ domain portfolio investors.'}
                                </p>
                            </div>
                        </div>

                        <div className="shrink-0 pt-2 sm:pt-0">
                            <span className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-brand-600 text-white shadow-md shadow-brand-500/25 whitespace-nowrap">
                                {ctaText || 'Learn More →'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-3.5 text-xs font-mono font-bold uppercase tracking-wider shadow-lg shadow-brand-500/25 hover:scale-[1.01] transition-transform"
            >
                {submitting ? 'Submitting Banner Placement...' : `Submit Reservation for Box #${selectedSlot} (${currentPos?.priceUsd ?? 499}/mo) →`}
            </button>

            <p className="text-[11px] text-center text-slate-500 font-mono">
                No immediate credit card charge. Our team verifies your creative and provides payment checkout via Escrow, Stripe, or Wire.
            </p>
        </form>
    );
}

export default function AdvertisePage() {
    return (
        <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">
            {/* Header Hero */}
            <div className="text-center space-y-4 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-950 border border-brand-800 text-brand-300 text-xs font-mono font-bold uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Targeted Digital Real Estate Media
                </div>
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                    Advertise on Domain<span className="text-brand-400">IQ</span>
                </h1>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Put your brand directly in front of 50,000+ domain portfolio investors, venture-backed founders, brokers, and institutional digital asset acquirers every month.
                </p>
            </div>

            {/* Audience Demographics KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="card p-5 rounded-2xl border-slate-800 bg-slate-900/60 space-y-1">
                    <div className="text-3xl font-black text-brand-400 font-mono">50K+</div>
                    <div className="text-xs text-slate-400 uppercase font-mono">Monthly Appraisals</div>
                </div>
                <div className="card p-5 rounded-2xl border-slate-800 bg-slate-900/60 space-y-1">
                    <div className="text-3xl font-black text-cyan-400 font-mono">82%</div>
                    <div className="text-xs text-slate-400 uppercase font-mono">Portfolio Owners</div>
                </div>
                <div className="card p-5 rounded-2xl border-slate-800 bg-slate-900/60 space-y-1">
                    <div className="text-3xl font-black text-emerald-400 font-mono">$18.5K</div>
                    <div className="text-xs text-slate-400 uppercase font-mono">Avg Asset Value</div>
                </div>
                <div className="card p-5 rounded-2xl border-slate-800 bg-slate-900/60 space-y-1">
                    <div className="text-3xl font-black text-purple-400 font-mono">3.2%</div>
                    <div className="text-xs text-slate-400 uppercase font-mono">Avg Partner CTR</div>
                </div>
            </div>

            {/* 4 Strategic Ad Positions Grid */}
            <div className="space-y-6">
                <div className="text-center space-y-1">
                    <h2 className="text-2xl font-black text-white tracking-tight">
                        4 Strategic Ad Box Placements
                    </h2>
                    <p className="text-xs font-mono text-slate-400">
                        Choose your dedicated slot with live link push synchronization.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {AD_POSITIONS.map((pos) => (
                        <div
                            key={pos.slotId}
                            className={`card p-6 rounded-2xl border ${pos.borderColor} bg-slate-900/80 shadow-xl flex flex-col justify-between relative overflow-hidden`}
                        >
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                                                Box #{pos.slotId}
                                            </span>
                                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-brand-950 text-brand-300 border border-brand-800">
                                                {pos.badge}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-bold text-white">{pos.name}</h3>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-black text-emerald-400 font-mono">
                                            ${pos.priceUsd}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono">per month</div>
                                    </div>
                                </div>

                                <div className="space-y-2 text-xs text-slate-300">
                                    <div className="flex items-center justify-between py-1 border-b border-slate-800">
                                        <span className="text-slate-400">Placement:</span>
                                        <span className="font-mono text-white text-right">{pos.location}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1 border-b border-slate-800">
                                        <span className="text-slate-400">Format:</span>
                                        <span className="text-right text-[11px] text-slate-300 max-w-[240px]">{pos.format}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1 border-b border-slate-800">
                                        <span className="text-slate-400">Est. Impressions:</span>
                                        <span className="font-mono text-cyan-400 font-bold">{pos.monthlyViews} / mo</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-slate-400">Best Fit:</span>
                                        <span className="text-right text-[11px] text-slate-300 max-w-[240px]">{pos.bestFor}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-5 mt-4 border-t border-slate-800">
                                <a
                                    href="#book-slot"
                                    className="btn-primary w-full py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-center block"
                                >
                                    Select Box #{pos.slotId} →
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Booking Form Section */}
            <div id="book-slot" className="pt-6">
                <Suspense
                    fallback={
                        <div className="card p-8 text-center text-xs font-mono text-slate-400 animate-pulse">
                            Loading reservation terminal...
                        </div>
                    }
                >
                    <AdvertiseForm />
                </Suspense>
            </div>
        </div>
    );
}
