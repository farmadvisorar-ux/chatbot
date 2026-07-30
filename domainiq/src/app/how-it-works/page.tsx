const STEPS = [
    {
        title: '1. Length & structure',
        body: 'Shorter root labels score higher on a non-linear curve — a 4-character domain is worth disproportionately more than a 12-character one, mirroring real aftermarket pricing.',
    },
    {
        title: '2. Word composition',
        body: 'We segment the domain against a 63,000-word English dictionary to detect whether it\'s a single real word, a clean two-word compound, or a coined/brandable string, and score clarity accordingly.',
    },
    {
        title: '3. Brandability',
        body: 'Pronounceability signals — vowel/consonant balance, syllable count, repeated characters, digits and hyphens — feed a memorability score independent of dictionary matching.',
    },
    {
        title: '4. Extension (TLD) authority',
        body: 'Each extension carries a market-authority score and a price multiplier relative to the equivalent .com, based on observed aftermarket demand (.com, .io and .ai command large premiums; many new gTLDs carry very little).',
    },
    {
        title: '5. Keyword commercial demand',
        body: 'The domain is checked against a curated table of high buyer-intent keywords (insurance, loans, AI, casino, crypto, and more), each with a demand multiplier reflecting typical end-buyer budgets in that category.',
    },
    {
        title: '6. Comparable sales',
        body: 'We match the domain against a curated dataset of real, publicly reported domain sales by extension, category and length, and blend a similarity-weighted implied price into the final estimate — the more relevant comps we find, the more they influence the number, and the higher the reported confidence.',
    },
    {
        title: '+ Registration age (when available)',
        body: 'A public RDAP lookup checks how long the domain has been registered. Older domains get a modest bonus, reflecting the SEO/trust value of an established registration. If the lookup fails or times out, this factor is simply omitted rather than guessed.',
    },
];

export default function HowItWorksPage() {
    return (
        <div className="mx-auto max-w-3xl space-y-10">
            <div className="text-center">
                <h1 className="text-3xl font-bold">How DomainIQ calculates a valuation</h1>
                <p className="mt-2 text-slate-500">
                    No trade secrets, no black box. Every factor below is shown on every valuation report, along with the
                    exact score it received.
                </p>
            </div>

            <div className="space-y-6">
                {STEPS.map((s) => (
                    <div key={s.title} className="card p-6">
                        <h2 className="font-semibold">{s.title}</h2>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{s.body}</p>
                    </div>
                ))}
            </div>

            <div className="card p-6">
                <h2 className="font-semibold">Putting it together</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Length, word composition and brandability combine into a single 0-100 &ldquo;linguistic score,&rdquo;
                    which maps to a baseline dollar value through an exponential curve (short, clean, real-word domains
                    are worth exponentially more, not linearly more). That baseline is then multiplied by the extension's
                    price multiplier and any matched keyword's demand multiplier, and finally blended with the
                    comparable-sales estimate in proportion to how many strong comps we found. The result is a midpoint
                    estimate, a low/high range sized by how confident the comps signal is, and a confidence label.
                </p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    This is a transparent heuristic model, not a machine-learning black box and not a live market feed —
                    it won't know about a private negotiation that happened yesterday. Treat every number as a
                    well-reasoned estimate to anchor your own research, not a guaranteed sale price.
                </p>
            </div>
        </div>
    );
}
