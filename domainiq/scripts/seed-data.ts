// Curated comparable domain-name sales.
//
// These figures are compiled from public press coverage (domain-industry
// trade press such as DNJournal's historic sales charts, and mainstream
// tech/business reporting) of *domain name* transactions specifically —
// not company acquisitions that happened to include a domain. Reported
// numbers for private domain sales often vary slightly between sources or
// are rounded by the parties involved; treat every row as an approximate,
// directional reference point rather than a verified, audited record.
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
];
