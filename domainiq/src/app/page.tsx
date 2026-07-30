import Link from 'next/link';
import DomainCheckerForm from '@/components/DomainCheckerForm';
import AdSlot from '@/components/AdSlot';

const FEATURES = [
    {
        title: 'Explainable, not a black box',
        body: 'Every valuation shows its full breakdown — length, word composition, brandability, TLD authority, keyword demand and matched comparable sales — so you know exactly why a domain scored the way it did.',
    },
    {
        title: 'Real comparable sales',
        body: 'Estimates are anchored against a curated dataset of actual reported domain sales, not just a length/keyword formula pulled out of thin air.',
    },
    {
        title: 'No email wall',
        body: "Most \"free\" appraisal tools force an email capture before showing a number. DomainIQ shows the full report immediately — sign up only if you want to save domains or track a portfolio.",
    },
    {
        title: 'Bulk & portfolio tools',
        body: 'Check up to 200 domains at once, track a watchlist with price-change history, and compare domains side by side.',
    },
];

export default function HomePage() {
    return (
        <div className="space-y-20">
            <section className="text-center">
                <span className="label-pill mb-4 bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    Free · No signup required · No email wall
                </span>
                <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
                    What is your domain actually worth?
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
                    Get an instant, fully explained estimate — built from real comparable sales and a transparent
                    multi-factor scoring engine, not a guess.
                </p>
                <div className="mx-auto mt-8 max-w-xl">
                    <DomainCheckerForm />
                </div>
                <p className="mt-3 text-sm text-slate-400">
                    e.g. try <Link href="/valuation/insurance.com" className="underline hover:text-brand-600">insurance.com</Link>,{' '}
                    <Link href="/valuation/voice.com" className="underline hover:text-brand-600">voice.com</Link>, or your own domain
                </p>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
                {FEATURES.map((f) => (
                    <div key={f.title} className="card p-6">
                        <h3 className="mb-2 font-semibold">{f.title}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{f.body}</p>
                    </div>
                ))}
            </section>

            <AdSlot className="mx-auto max-w-3xl" />

            <section className="card grid gap-8 p-8 sm:grid-cols-3">
                <div>
                    <div className="text-3xl font-bold text-brand-600">6</div>
                    <p className="text-sm text-slate-500">weighted valuation factors, shown in full for every domain</p>
                </div>
                <div>
                    <div className="text-3xl font-bold text-brand-600">200</div>
                    <p className="text-sm text-slate-500">domains checkable at once with a free account</p>
                </div>
                <div>
                    <div className="text-3xl font-bold text-brand-600">$0</div>
                    <p className="text-sm text-slate-500">cost to get a full valuation report, forever</p>
                </div>
            </section>

            <section className="text-center">
                <h2 className="text-2xl font-bold">Want the full methodology?</h2>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                    See exactly how scores and price ranges are calculated — no trade secrets.
                </p>
                <Link href="/how-it-works" className="btn-secondary mt-4 inline-flex">Read the methodology →</Link>
            </section>
        </div>
    );
}
