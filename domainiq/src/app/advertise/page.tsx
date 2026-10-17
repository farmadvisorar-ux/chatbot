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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        const currentPos = AD_POSITIONS.find((p) => p.slotId === selectedSlot);

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
                    Sponsorship Reservation Received!
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                    Thank you, <span className="font-bold text-white">{company}</span>. Your reservation for <span className="font-mono text-emerald-400">Ad Box #{selectedSlot}</span> has been routed directly to our admin terminal for review.
                </p>
                <p className="text-xs text-slate-400 font-mono">
                    We will review your destination URL (<span className="text-slate-300">{destinationUrl}</span>) and contact you at <span className="text-slate-300">{email}</span> within 24 hours to confirm payment and push your live link.
                </p>
                <div className="pt-4">
                    <Link href="/" className="btn-primary text-xs font-mono font-bold uppercase tracking-wider px-6 py-2.5">
                        ← Return to DomainIQ Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="card p-6 sm:p-8 rounded-2xl border-brand-500/30 bg-slate-900/90 shadow-2xl space-y-5">
            <h3 className="text-base font-black text-white tracking-tight border-b border-slate-800 pb-3">
                Reserve Your Ad Box Placement
            </h3>

            {error && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono">
                    ⚠ {error}
                </div>
            )}

            <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                    Select Ad Placement
                </label>
                <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(Number(e.target.value))}
                    className="input w-full text-xs font-mono bg-slate-950 border-slate-800"
                >
                    {AD_POSITIONS.map((pos) => (
                        <option key={pos.slotId} value={pos.slotId}>
                            Box #{pos.slotId}: {pos.name} (${pos.priceUsd}/mo)
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-300 block">Company / Brand Name *</label>
                    <input
                        type="text"
                        required
                        placeholder="e.g. Sedo, Escrow.com, Namecheap"
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
                        placeholder="e.g. Alex Morgan"
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
                        placeholder="partner@yourcompany.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input w-full text-xs font-mono bg-slate-950"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-mono text-brand-300 font-bold block">
                        Live Destination Link *
                    </label>
                    <input
                        type="url"
                        required
                        placeholder="https://yourcompany.com/landing"
                        value={destinationUrl}
                        onChange={(e) => setDestinationUrl(e.target.value)}
                        className="input w-full text-xs font-mono bg-slate-950 border-brand-500/50"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-300 block">Campaign Objective &amp; Notes</label>
                <textarea
                    rows={3}
                    placeholder="Describe your target offer, preferred start date, or promotional copy..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input w-full text-xs bg-slate-950"
                />
            </div>

            <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-3 text-xs font-mono font-bold uppercase tracking-wider"
            >
                {submitting ? 'Submitting Reservation...' : 'Submit Sponsorship Request →'}
            </button>

            <p className="text-[11px] text-center text-slate-500 font-mono">
                No automatic charges. We verify brand suitability and send an invoice with direct escrow / credit card checkout.
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
