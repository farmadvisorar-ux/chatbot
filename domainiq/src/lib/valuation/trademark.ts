export interface TrademarkMatch {
    mark: string;
    note: string;
}

export interface TrademarkResult {
    /** Whether a live USPTO search actually ran (false = heuristic-only). */
    checked: boolean;
    source: 'uspto-live' | 'heuristic-only';
    riskLevel: 'unknown' | 'low' | 'elevated';
    matches: TrademarkMatch[];
    disclaimer: string;
}

const NOT_LEGAL_ADVICE =
    'This is an automated screen, not a legal opinion — it does not check WIPO/international marks, common-law (unregistered) marks, or every USPTO class, and it is not a substitute for a trademark attorney before you buy or launch on this domain.';

// A short list of globally famous marks, used only as an always-on sanity
// check when live USPTO search isn't configured. Deliberately small and
// conservative — this is not trademark research, just a flag for the most
// obvious collisions (e.g. a domain built around "apple" or "nike").
const FAMOUS_MARKS = [
    'apple', 'google', 'amazon', 'microsoft', 'meta', 'facebook', 'instagram',
    'nike', 'adidas', 'coca-cola', 'cocacola', 'pepsi', 'starbucks', 'mcdonalds',
    'disney', 'netflix', 'spotify', 'uber', 'airbnb', 'tesla', 'samsung', 'sony',
    'nvidia', 'openai', 'chatgpt', 'walmart', 'target', 'visa', 'mastercard',
    'paypal', 'ebay', 'twitter', 'youtube', 'linkedin', 'salesforce', 'oracle',
    'ibm', 'intel', 'adobe', 'zoom', 'slack', 'shopify', 'stripe', 'chase',
    'wellsfargo', 'americanexpress', 'fedex', 'ups', 'redbull', 'gillette',
];

function heuristicScreen(label: string): TrademarkResult {
    const lower = label.toLowerCase();
    const matches: TrademarkMatch[] = [];
    for (const mark of FAMOUS_MARKS) {
        if (lower.includes(mark)) {
            matches.push({ mark, note: `Contains "${mark}", a globally famous registered mark — high risk of enforcement action.` });
        }
    }
    return {
        checked: false,
        source: 'heuristic-only',
        riskLevel: matches.length > 0 ? 'elevated' : 'unknown',
        matches,
        disclaimer: matches.length > 0
            ? NOT_LEGAL_ADVICE
            : `No live USPTO search was run (set USPTO_API_KEY to enable one). This domain wasn't flagged by the basic famous-mark check, but that check only covers a short list of extremely well-known brands — absence of a flag is not clearance. ${NOT_LEGAL_ADVICE}`,
    };
}

interface UsptoApiRecord {
    markText?: string;
    wordmark?: string;
    mark?: string;
    status?: string;
}

/**
 * Live USPTO trademark search, only attempted when USPTO_API_KEY is set.
 * As of this writing USPTO requires a (free, self-service) API key for
 * their Trademark Search API at api.uspto.gov — get one at
 * https://account.uspto.gov/api-manager/. Any failure (network, auth,
 * unexpected response shape) falls back to the heuristic screen rather
 * than silently claiming a false "no conflicts" result.
 */
export async function checkTrademarkRisk(label: string, timeoutMs = 4000): Promise<TrademarkResult> {
    const apiKey = process.env.USPTO_API_KEY;
    if (!apiKey) return heuristicScreen(label);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`https://api.uspto.gov/api/v1/trademarks/search?q=${encodeURIComponent(label)}`, {
            signal: controller.signal,
            headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
        });
        if (!res.ok) return heuristicScreen(label);

        const data = (await res.json()) as { results?: UsptoApiRecord[] } | UsptoApiRecord[];
        const records: UsptoApiRecord[] = Array.isArray(data) ? data : (data.results ?? []);

        const matches: TrademarkMatch[] = records
            .filter((r) => (r.markText ?? r.wordmark ?? r.mark ?? '').toLowerCase().includes(label.toLowerCase()))
            .slice(0, 10)
            .map((r) => ({
                mark: r.markText ?? r.wordmark ?? r.mark ?? 'Unknown mark',
                note: r.status ? `USPTO status: ${r.status}` : 'Registered mark on file with USPTO',
            }));

        return {
            checked: true,
            source: 'uspto-live',
            riskLevel: matches.length > 0 ? 'elevated' : 'low',
            matches,
            disclaimer: NOT_LEGAL_ADVICE,
        };
    } catch {
        return heuristicScreen(label);
    } finally {
        clearTimeout(timer);
    }
}
