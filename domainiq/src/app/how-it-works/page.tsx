const STEPS = [
    {
        title: '1. Length & structure',
        body: 'Shorter root labels score higher, but not by a smooth exponential — the price mapping (step 6 below) is banded so that only truly exceptional short strings reach real premium territory, matching how the aftermarket actually behaves rather than a formula that explodes upward in the middle of the range.',
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
        title: '6. Baseline price curve',
        body: 'Length, word composition and brandability combine into a single 0-100 "linguistic score," which maps to a baseline dollar value via a set of authored price-band control points (log-interpolated between them), not a single runaway exponential. That baseline is then multiplied by the extension\'s price multiplier and any matched keyword\'s demand multiplier.',
    },
    {
        title: '7. Comparable sales, price-gated',
        body: 'We match the domain against a dataset of 100+ reference sales by extension, category and length — but a comp only gets real weight if its price is also in the same order of magnitude as this domain\'s own independent baseline estimate. Without that gate, a handful of famous multi-million-dollar headline sales (which is disproportionately what\'s publicly documented) would drag an ordinary domain\'s price toward them just because both happen to be, say, a 9-character .com. If the exact domain you searched has a recorded sale, that figure is used directly instead of the formula.',
    },
    {
        title: '8. Phonetic clarity (the "radio test")',
        body: 'Separately from pronounceability, we check how easily someone could spell the domain correctly after only hearing it read aloud — ambiguous letter clusters, mixed letters-and-digits, letters that visually misread as other letters, and a small non-exhaustive list of known problem meanings in other major languages.',
    },
    {
        title: '9. Channel pricing',
        body: 'The blended estimate is split into three price points instead of one: a wholesale price (quick sale to another domain investor), an inbound buy-it-now price (what a passive end-user pays on a landing page — this is the headline number), and an outbound target (the ceiling when proactively pitching a funded or established business), scaled up by how "hot" the domain\'s vertical currently is for well-capitalized buyers.',
    },
    {
        title: '10. Trademark & legal friction',
        body: 'If you configure a free USPTO API key, every report runs a live trademark search. Without one, a small built-in list of globally famous marks is checked instead, and the report clearly labels which kind of check actually ran — it never claims a domain is "clear" without a real check behind that claim.',
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
                <h2 className="font-semibold">What's in the comps dataset</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Two kinds of rows, and every valuation report tells you which kind matched:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
                    <li>
                        <strong>Reported industry press sales</strong> — real domain-name transactions covered by
                        domain-industry trade press or mainstream business reporting. These skew toward famous,
                        high-dollar deals, since that's overwhelmingly what gets public coverage.
                    </li>
                    <li>
                        <strong>Illustrative aftermarket-tier estimates</strong> — synthetic reference points spanning
                        the price tiers that dominate the real aftermarket (hundreds to low tens-of-thousands of
                        dollars) and extensions beyond .com, grounded in generally-known price-band ratios per
                        extension and quality tier rather than any single transaction. These exist to give ordinary,
                        non-headline domains something realistic to be compared against.
                    </li>
                </ul>
            </div>

            <div className="card p-6">
                <h2 className="font-semibold">About the vertical &amp; buyer-targeting data</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    The "outbound fit" score and vertical capital-heat tag (e.g. "AI/ML — high heat") are a
                    hand-curated proxy for which industries currently draw well-funded buyers, reasoned from
                    generally-known investment trends — not a live feed from Crunchbase, PitchBook, or any funding
                    database. The go-to-market section describes the type of buyer and pitch angle to target; it
                    never invents specific real company names, since this app has no company database to back that
                    up truthfully.
                </p>
            </div>

            <div className="card p-6">
                <h2 className="font-semibold">How this compares to paid appraisal tools</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Commercial tools like GoDaddy's appraisal, Estibot, or HumbleWorth draw on internal marketplace
                    data covering hundreds of thousands of real listings and sales, plus signals this tool doesn't
                    have access to — search volume/CPC data, backlink and traffic metrics, live marketplace asking
                    prices. Some train a machine-learning model on that data rather than using authored rules.
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    DomainIQ's methodology follows the same general shape (length + extension + keyword demand +
                    comparable sales) but runs entirely on a small, transparent, hand-curated dataset with no paid
                    data feed behind it. Expect it to track well for domains that closely resemble something in that
                    dataset, and to be directionally reasonable — not precisely matched to any specific paid tool —
                    everywhere else. Treat every number here as a well-reasoned estimate to anchor your own research,
                    not a guaranteed sale price or a substitute for a professional appraisal on a high-value domain.
                </p>
            </div>
        </div>
    );
}
