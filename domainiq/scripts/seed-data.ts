// Curated comparable domain-name sales.
//
// Two distinct kinds of rows, both clearly labeled via sourceNote:
//
// 1. "Reported industry press sale" — figures compiled from public press
//    coverage (domain-industry trade press such as DNJournal's historic
//    sales charts, and mainstream tech/business reporting) of *domain
//    name* transactions specifically, not company acquisitions that
//    happened to include a domain. These skew toward famous,
//    multi-million-dollar deals, since those are what's publicly
//    documented — real mid-tier and small sales rarely get press
//    coverage. Reported numbers for private sales often vary slightly
//    between sources or are rounded by the parties involved; treat every
//    row as an approximate, directional reference point, not a verified
//    audited record.
//
// 2. "Illustrative ... estimate" — synthetic reference points, not real
//    transactions, added to give the comps-matching engine coverage
//    across the price tiers that dominate the actual aftermarket (most
//    domains that sell go for hundreds to low tens-of-thousands of
//    dollars, not millions) and across extensions beyond .com. Prices are
//    grounded in generally-known aftermarket price bands per extension
//    and quality tier (e.g. a decent two-word .com commonly trades in the
//    low thousands; .io/.ai typically 30-60% of an equivalent .com; new
//    gTLDs mostly near registration cost) — not derived from this app's
//    own scoring formula, so they act as an independent check on it
//    rather than a circular reinforcement of it.
//
// The valuation engine uses these only to anchor its heuristic score
// against real market behavior, blended with (and bounded by) the
// algorithmic factors — never as a sole source of truth.
export interface CompSeed {
    domain: string;
    salePriceUsd: number;
    saleYear: number;
    wordCount: number; // 0 = brandable/non-dictionary, 1 = single word, 2 = two-word compound
    category: string;
    sourceNote: string;
}

export const COMPS: CompSeed[] = [
    { domain: 'insurance.com', salePriceUsd: 35_600_000, saleYear: 2010, wordCount: 1, category: 'finance', sourceNote: 'Reported industry press sale' },
    { domain: 'vacationrentals.com', salePriceUsd: 35_000_000, saleYear: 2007, wordCount: 2, category: 'travel', sourceNote: 'Reported industry press sale' },
    { domain: 'privatejet.com', salePriceUsd: 30_180_000, saleYear: 2012, wordCount: 2, category: 'travel', sourceNote: 'Reported industry press sale' },
    { domain: 'voice.com', salePriceUsd: 30_000_000, saleYear: 2019, wordCount: 1, category: 'tech', sourceNote: 'Reported industry press sale' },
    { domain: 'nft.com', salePriceUsd: 15_000_000, saleYear: 2022, wordCount: 0, category: 'crypto', sourceNote: 'Reported industry press sale' },
    { domain: 'sex.com', salePriceUsd: 13_000_000, saleYear: 2010, wordCount: 1, category: 'adult', sourceNote: 'Reported industry press sale' },
    { domain: 'fund.com', salePriceUsd: 9_999_950, saleYear: 2008, wordCount: 1, category: 'finance', sourceNote: 'Reported industry press sale' },
    { domain: 'porn.com', salePriceUsd: 9_500_000, saleYear: 2007, wordCount: 1, category: 'adult', sourceNote: 'Reported industry press sale' },
    { domain: 'fb.com', salePriceUsd: 8_500_000, saleYear: 2010, wordCount: 0, category: 'brandable', sourceNote: 'Reported industry press sale' },
    { domain: 'we.com', salePriceUsd: 8_000_000, saleYear: 2015, wordCount: 0, category: 'brandable', sourceNote: 'Reported industry press sale' },
    { domain: 'diamond.com', salePriceUsd: 7_500_000, saleYear: 2006, wordCount: 1, category: 'retail', sourceNote: 'Reported industry press sale' },
    { domain: 'business.com', salePriceUsd: 7_500_000, saleYear: 1999, wordCount: 1, category: 'business', sourceNote: 'Reported industry press sale' },
    { domain: 'z.com', salePriceUsd: 6_800_000, saleYear: 2014, wordCount: 0, category: 'brandable', sourceNote: 'Reported industry press sale' },
    { domain: 'icloud.com', salePriceUsd: 4_500_000, saleYear: 2011, wordCount: 1, category: 'tech', sourceNote: 'Reported industry press sale' },
    { domain: 'clothes.com', salePriceUsd: 4_900_000, saleYear: 2008, wordCount: 1, category: 'retail', sourceNote: 'Reported industry press sale' },
    { domain: 'slots.com', salePriceUsd: 5_500_000, saleYear: 2010, wordCount: 1, category: 'gaming', sourceNote: 'Reported industry press sale' },
    { domain: 'casino.com', salePriceUsd: 5_500_000, saleYear: 2003, wordCount: 1, category: 'gaming', sourceNote: 'Reported industry press sale' },
    { domain: 'toys.com', salePriceUsd: 5_100_000, saleYear: 2009, wordCount: 1, category: 'retail', sourceNote: 'Reported industry press sale' },
    { domain: 'whisky.com', salePriceUsd: 3_090_000, saleYear: 2014, wordCount: 1, category: 'retail', sourceNote: 'Reported industry press sale' },
    { domain: 'ice.com', salePriceUsd: 3_000_000, saleYear: 2011, wordCount: 1, category: 'retail', sourceNote: 'Reported industry press sale' },
    { domain: 'loans.com', salePriceUsd: 3_000_000, saleYear: 2011, wordCount: 1, category: 'finance', sourceNote: 'Reported industry press sale' },
    { domain: 'pizza.com', salePriceUsd: 2_600_000, saleYear: 2008, wordCount: 1, category: 'food', sourceNote: 'Reported industry press sale' },
    { domain: 'shoes.com', salePriceUsd: 2_600_000, saleYear: 2004, wordCount: 1, category: 'retail', sourceNote: 'Reported industry press sale' },
    { domain: 'turkey.com', salePriceUsd: 2_200_000, saleYear: 2011, wordCount: 1, category: 'other', sourceNote: 'Reported industry press sale' },
    { domain: 'hoteles.com', salePriceUsd: 2_000_000, saleYear: 2005, wordCount: 1, category: 'travel', sourceNote: 'Reported industry press sale' },
    { domain: 'rehab.com', salePriceUsd: 1_500_000, saleYear: 2012, wordCount: 1, category: 'health', sourceNote: 'Reported industry press sale' },
    { domain: '720.com', salePriceUsd: 860_000, saleYear: 2012, wordCount: 0, category: 'numeric', sourceNote: 'Reported industry press sale' },
    { domain: 'metaverse.com', salePriceUsd: 900_000, saleYear: 2021, wordCount: 1, category: 'tech', sourceNote: 'Reported industry press sale' },
    { domain: 'crm.io', salePriceUsd: 60_000, saleYear: 2020, wordCount: 0, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'send.io', salePriceUsd: 45_000, saleYear: 2021, wordCount: 1, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'stack.io', salePriceUsd: 38_000, saleYear: 2019, wordCount: 1, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'launch.io', salePriceUsd: 32_000, saleYear: 2020, wordCount: 1, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'build.ai', salePriceUsd: 55_000, saleYear: 2023, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'chat.ai', salePriceUsd: 220_000, saleYear: 2023, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'agents.ai', salePriceUsd: 90_000, saleYear: 2024, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'data.ai', salePriceUsd: 150_000, saleYear: 2022, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'getflow.co', salePriceUsd: 8_000, saleYear: 2021, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'tryhive.co', salePriceUsd: 6_500, saleYear: 2022, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'bluewaveconsulting.com', salePriceUsd: 1_200, saleYear: 2022, wordCount: 2, category: 'business', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'yourlocalplumberpro.com', salePriceUsd: 400, saleYear: 2023, wordCount: 2, category: 'local-services', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'north-ridge-realty247.net', salePriceUsd: 150, saleYear: 2022, wordCount: 2, category: 'local-services', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'petfood123shop.info', salePriceUsd: 90, saleYear: 2021, wordCount: 2, category: 'retail', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'bitcoin.io', salePriceUsd: 100_000, saleYear: 2021, wordCount: 1, category: 'crypto', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'defi.com', salePriceUsd: 500_000, saleYear: 2021, wordCount: 0, category: 'crypto', sourceNote: 'Reported industry press sale' },
    { domain: 'wallet.com', salePriceUsd: 500_000, saleYear: 2014, wordCount: 1, category: 'crypto', sourceNote: 'Reported industry press sale' },
    { domain: 'creditcards.com', salePriceUsd: 2_750_000, saleYear: 2004, wordCount: 2, category: 'finance', sourceNote: 'Reported industry press sale' },
    { domain: 'medicare.com', salePriceUsd: 4_800_000, saleYear: 2013, wordCount: 1, category: 'health', sourceNote: 'Reported industry press sale' },
    { domain: 'hotel.com', salePriceUsd: 1_000_000, saleYear: 2005, wordCount: 1, category: 'travel', sourceNote: 'Reported industry press sale' },
    { domain: 'candy.com', salePriceUsd: 3_000_000, saleYear: 2009, wordCount: 1, category: 'food', sourceNote: 'Reported industry press sale' },
    { domain: 'poker.org', salePriceUsd: 1_000_000, saleYear: 2003, wordCount: 1, category: 'gaming', sourceNote: 'Reported industry press sale' },
    { domain: 'travel.org', salePriceUsd: 750_000, saleYear: 2007, wordCount: 1, category: 'travel', sourceNote: 'Reported industry press sale' },
    { domain: 'jobs.co.uk', salePriceUsd: 250_000, saleYear: 2010, wordCount: 1, category: 'business', sourceNote: 'Illustrative ccTLD-tier estimate' },
    { domain: 'shop.de', salePriceUsd: 180_000, saleYear: 2015, wordCount: 1, category: 'retail', sourceNote: 'Illustrative ccTLD-tier estimate' },

    // --- Illustrative grid: .com, single dictionary word, no special keyword tier ($15k-$150k) ---
    { domain: 'harbor.com', salePriceUsd: 95_000, saleYear: 2022, wordCount: 1, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'meadow.com', salePriceUsd: 42_000, saleYear: 2021, wordCount: 1, category: 'other', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'lantern.com', salePriceUsd: 68_000, saleYear: 2020, wordCount: 1, category: 'retail', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'summit.com', salePriceUsd: 120_000, saleYear: 2019, wordCount: 1, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'compass.com', salePriceUsd: 110_000, saleYear: 2018, wordCount: 1, category: 'real-estate', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'orchard.com', salePriceUsd: 55_000, saleYear: 2022, wordCount: 1, category: 'food', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'cobalt.com', salePriceUsd: 38_000, saleYear: 2021, wordCount: 1, category: 'tech', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'ember.com', salePriceUsd: 72_000, saleYear: 2023, wordCount: 1, category: 'other', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'thicket.com', salePriceUsd: 18_000, saleYear: 2020, wordCount: 1, category: 'other', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'ripple.com', salePriceUsd: 135_000, saleYear: 2017, wordCount: 1, category: 'crypto', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: .com, two-word brandable ($800-$15k) ---
    { domain: 'brightpath.com', salePriceUsd: 4_200, saleYear: 2022, wordCount: 2, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'swiftcart.com', salePriceUsd: 6_800, saleYear: 2023, wordCount: 2, category: 'retail', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'greenleaf.com', salePriceUsd: 9_500, saleYear: 2021, wordCount: 2, category: 'health', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'clearpath.com', salePriceUsd: 5_200, saleYear: 2022, wordCount: 2, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'bluewave.com', salePriceUsd: 12_500, saleYear: 2020, wordCount: 2, category: 'tech', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'sunridge.com', salePriceUsd: 3_400, saleYear: 2023, wordCount: 2, category: 'real-estate', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'trueform.com', salePriceUsd: 2_900, saleYear: 2022, wordCount: 2, category: 'health', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'westfield.com', salePriceUsd: 14_000, saleYear: 2019, wordCount: 2, category: 'real-estate', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'daybreak.com', salePriceUsd: 7_100, saleYear: 2021, wordCount: 2, category: 'other', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'fastlane.com', salePriceUsd: 8_900, saleYear: 2023, wordCount: 2, category: 'auto', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'oakstreet.com', salePriceUsd: 1_600, saleYear: 2022, wordCount: 2, category: 'local-services', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'primehealth.com', salePriceUsd: 10_500, saleYear: 2021, wordCount: 2, category: 'health', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: .com, three-word / long-tail ($30-$800) ---
    { domain: 'bestcityautorepair.com', salePriceUsd: 220, saleYear: 2023, wordCount: 2, category: 'auto', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'topratedhomecleaners.com', salePriceUsd: 340, saleYear: 2022, wordCount: 2, category: 'local-services', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'dailyfitnessplanner.com', salePriceUsd: 480, saleYear: 2021, wordCount: 2, category: 'health', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'onlineresumebuilderhq.com', salePriceUsd: 190, saleYear: 2023, wordCount: 2, category: 'business', sourceNote: 'Illustrative long-tail estimate' },
    { domain: 'affordablewebdesignco.com', salePriceUsd: 260, saleYear: 2022, wordCount: 2, category: 'tech', sourceNote: 'Illustrative long-tail estimate' },

    // --- Illustrative grid: .io, mirroring .com tiers at ~30-50% ---
    { domain: 'harbor.io', salePriceUsd: 32_000, saleYear: 2022, wordCount: 1, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'ember.io', salePriceUsd: 24_000, saleYear: 2023, wordCount: 1, category: 'tech', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'swiftcart.io', salePriceUsd: 2_600, saleYear: 2023, wordCount: 2, category: 'retail', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'brightpath.io', salePriceUsd: 1_800, saleYear: 2022, wordCount: 2, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'dataforge.io', salePriceUsd: 15_500, saleYear: 2021, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'metricflow.io', salePriceUsd: 9_200, saleYear: 2022, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'pipelineiq.io', salePriceUsd: 6_400, saleYear: 2023, wordCount: 0, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: .ai, currently a hot extension, ~40-60% of .com ---
    { domain: 'summit.ai', salePriceUsd: 62_000, saleYear: 2024, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'orchard.ai', salePriceUsd: 28_000, saleYear: 2024, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'brightpath.ai', salePriceUsd: 5_800, saleYear: 2024, wordCount: 2, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'workflow.ai', salePriceUsd: 38_000, saleYear: 2023, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'copilotstack.ai', salePriceUsd: 12_000, saleYear: 2024, wordCount: 2, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'insight.ai', salePriceUsd: 45_000, saleYear: 2023, wordCount: 1, category: 'ai', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: .co, ~20-35% of .com ---
    { domain: 'harbor.co', salePriceUsd: 22_000, saleYear: 2021, wordCount: 1, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'swiftcart.co', salePriceUsd: 1_900, saleYear: 2022, wordCount: 2, category: 'retail', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'clearpath.co', salePriceUsd: 1_400, saleYear: 2021, wordCount: 2, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'launchbase.co', salePriceUsd: 3_200, saleYear: 2020, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: .net / .org, ~10-20% of .com ---
    { domain: 'harbor.net', salePriceUsd: 9_500, saleYear: 2019, wordCount: 1, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'greenleaf.net', salePriceUsd: 1_100, saleYear: 2020, wordCount: 2, category: 'health', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'meadow.org', salePriceUsd: 4_800, saleYear: 2018, wordCount: 1, category: 'other', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'clearpath.org', salePriceUsd: 620, saleYear: 2021, wordCount: 2, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: .dev / .app, developer-branding extensions ($200-$25k) ---
    { domain: 'buildstack.dev', salePriceUsd: 4_100, saleYear: 2022, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'apiforge.dev', salePriceUsd: 2_600, saleYear: 2023, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'launchpad.app', salePriceUsd: 13_500, saleYear: 2021, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'trackflow.app', salePriceUsd: 3_300, saleYear: 2022, wordCount: 2, category: 'saas', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: new gTLDs, mostly near registration cost ($10-$400) ---
    { domain: 'brightpath.xyz', salePriceUsd: 45, saleYear: 2022, wordCount: 2, category: 'business', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'swiftcart.online', salePriceUsd: 30, saleYear: 2023, wordCount: 2, category: 'retail', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'greenleaf.site', salePriceUsd: 25, saleYear: 2022, wordCount: 2, category: 'health', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'harbor.store', salePriceUsd: 180, saleYear: 2023, wordCount: 1, category: 'retail', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'clearpath.tech', salePriceUsd: 260, saleYear: 2021, wordCount: 2, category: 'tech', sourceNote: 'Illustrative aftermarket-tier estimate' },
    { domain: 'meadow.club', salePriceUsd: 60, saleYear: 2022, wordCount: 1, category: 'community', sourceNote: 'Illustrative aftermarket-tier estimate' },

    // --- Illustrative grid: ccTLDs, roughly 15-30% of a comparable .com ---
    { domain: 'harbor.us', salePriceUsd: 8_500, saleYear: 2020, wordCount: 1, category: 'business', sourceNote: 'Illustrative ccTLD-tier estimate' },
    { domain: 'swiftcart.ca', salePriceUsd: 1_500, saleYear: 2021, wordCount: 2, category: 'retail', sourceNote: 'Illustrative ccTLD-tier estimate' },
    { domain: 'clearpath.uk', salePriceUsd: 1_100, saleYear: 2022, wordCount: 2, category: 'business', sourceNote: 'Illustrative ccTLD-tier estimate' },
    { domain: 'meadow.co.uk', salePriceUsd: 6_200, saleYear: 2019, wordCount: 1, category: 'other', sourceNote: 'Illustrative ccTLD-tier estimate' },
    { domain: 'greenleaf.de', salePriceUsd: 2_800, saleYear: 2020, wordCount: 2, category: 'health', sourceNote: 'Illustrative ccTLD-tier estimate' },
    { domain: 'orchard.com.au', salePriceUsd: 3_400, saleYear: 2021, wordCount: 1, category: 'food', sourceNote: 'Illustrative ccTLD-tier estimate' },
];
