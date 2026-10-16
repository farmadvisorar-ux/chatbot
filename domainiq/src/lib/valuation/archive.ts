export interface ArchiveHistoryResult {
    /** Whether the live archive query was successfully executed */
    checked: boolean;
    /** Whether any historical snapshots were found */
    hasSnapshots: boolean;
    /** Earliest recorded snapshot year */
    firstSeenYear: number | null;
    /** Earliest recorded snapshot ISO date */
    firstSeenDate: string | null;
    /** Most recent recorded snapshot year */
    lastSeenYear: number | null;
    /** Most recent recorded snapshot ISO date */
    lastSeenDate: string | null;
    /** Total years spanned in web archive */
    archiveAgeYears: number | null;
    /** Direct URL to browse Wayback calendar */
    waybackUrl: string;
    /** Historical timeline assessment */
    historicalContinuity: 'longstanding' | 'established' | 'recent' | 'virgin' | 'drop-risk';
    /** Due diligence status */
    riskStatus: 'clean-history' | 'virgin-domain' | 'dormant-gap' | 'high-risk-drop';
    /** Headline summary for UI cards */
    summary: string;
    /** Detailed explanatory due-diligence note */
    details: string;
}

function parseWaybackTimestamp(ts: string): { iso: string; year: number } | null {
    if (!ts || ts.length < 8) return null;
    const year = parseInt(ts.substring(0, 4), 10);
    const month = parseInt(ts.substring(4, 6), 10) - 1;
    const day = parseInt(ts.substring(6, 8), 10);
    const date = new Date(Date.UTC(year, month, day));
    if (isNaN(date.getTime())) return null;
    return { iso: date.toISOString().split('T')[0] ?? '', year };
}

/**
 * Queries the Internet Archive Wayback Machine CDX and Availability APIs
 * to determine historical domain presence, continuity, and drop history.
 */
export async function lookupArchiveHistory(
    domain: string,
    rdapRegistrationDate?: string | null,
    timeoutMs = 1200,
): Promise<ArchiveHistoryResult> {

    const waybackUrl = `https://web.archive.org/web/*/${encodeURIComponent(domain)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const cleanDomain = domain.toLowerCase().trim();

        // 1. Fetch earliest snapshot via CDX API
        const cdxPromise = fetch(
            `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(cleanDomain)}&output=json&fl=timestamp,statuscode&filter=statuscode:200&limit=1`,
            {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            },
        ).then(async (r) => {
            if (!r.ok) return null;
            const data = (await r.json()) as string[][];
            // data format is [["timestamp", "statuscode"], ["19981111184551", "200"]]
            if (Array.isArray(data) && data.length > 1 && data[1] && data[1][0]) {
                return data[1][0];
            }
            return null;
        }).catch(() => null);

        // 2. Fetch closest recent snapshot via Availability API
        const availPromise = fetch(
            `https://archive.org/wayback/available?url=https://${encodeURIComponent(cleanDomain)}`,
            {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            },
        ).then(async (r) => {
            if (!r.ok) return null;
            const data = (await r.json()) as { archived_snapshots?: { closest?: { timestamp?: string; available?: boolean } } };
            if (data.archived_snapshots?.closest?.available && data.archived_snapshots.closest.timestamp) {
                return data.archived_snapshots.closest.timestamp;
            }
            return null;
        }).catch(() => null);

        const [earliestTs, latestTs] = await Promise.all([cdxPromise, availPromise]);

        const earliest = earliestTs ? parseWaybackTimestamp(earliestTs) : null;
        const latest = latestTs ? parseWaybackTimestamp(latestTs) : null;

        if (!earliest && !latest) {
            return {
                checked: true,
                hasSnapshots: false,
                firstSeenYear: null,
                firstSeenDate: null,
                lastSeenYear: null,
                lastSeenDate: null,
                archiveAgeYears: 0,
                waybackUrl,
                historicalContinuity: 'virgin',
                riskStatus: 'virgin-domain',
                summary: 'Virgin Domain — No Prior Web History',
                details: 'No historical crawl snapshots recorded in the Wayback Machine. This represents a blank-slate domain with zero past spam, penalization, or PBN footprint.',
            };
        }

        const firstSeenYear = earliest?.year ?? latest?.year ?? null;
        const firstSeenDate = earliest?.iso ?? latest?.iso ?? null;
        const lastSeenYear = latest?.year ?? earliest?.year ?? null;
        const lastSeenDate = latest?.iso ?? earliest?.iso ?? null;

        const currentYear = new Date().getFullYear();
        const archiveAgeYears = firstSeenYear ? Math.max(0.5, currentYear - firstSeenYear) : null;

        // Check for drop / re-registration discrepancy against current RDAP registration date
        let isDropRisk = false;
        let rdapRegYear: number | null = null;
        if (rdapRegistrationDate) {
            const rdapDate = new Date(rdapRegistrationDate);
            if (!isNaN(rdapDate.getTime())) {
                rdapRegYear = rdapDate.getFullYear();
                if (firstSeenYear && rdapRegYear - firstSeenYear >= 3) {
                    isDropRisk = true;
                }
            }
        }

        let historicalContinuity: ArchiveHistoryResult['historicalContinuity'] = 'established';
        let riskStatus: ArchiveHistoryResult['riskStatus'] = 'clean-history';
        let summary = 'Established Web Presence';
        let details = `First indexed in ${firstSeenYear} (spans ~${archiveAgeYears?.toFixed(1)} years). Active historical presence recorded.`;

        if (isDropRisk && firstSeenYear && rdapRegYear) {
            historicalContinuity = 'drop-risk';
            riskStatus = 'dormant-gap';
            summary = `Historical Drop Detected (Archived in ${firstSeenYear}, Re-registered in ${rdapRegYear})`;
            details = `This domain was initially live and archived in ${firstSeenYear}, but current registration shows ${rdapRegYear}. The domain likely expired or sat dormant before re-acquisition. Historical backlink authority may have experienced a reset.`;
        } else if (archiveAgeYears && archiveAgeYears >= 15) {
            historicalContinuity = 'longstanding';
            riskStatus = 'clean-history';
            summary = `Longstanding Digital Footprint (~${archiveAgeYears.toFixed(0)}+ Years)`;
            details = `Continuous historical record dating back to ${firstSeenYear}. Longstanding domains carry significant organic SEO trust and institutional credibility.`;
        } else if (archiveAgeYears && archiveAgeYears >= 5) {
            historicalContinuity = 'established';
            riskStatus = 'clean-history';
            summary = `Seasoned Web History (~${archiveAgeYears.toFixed(1)} Years)`;
            details = `Regular crawl snapshots archived between ${firstSeenYear} and ${lastSeenYear}. Solid domain vintage without immediate red flags.`;
        } else {
            historicalContinuity = 'recent';
            riskStatus = 'clean-history';
            summary = `Recent Web History (First Seen ${firstSeenYear})`;
            details = `Archived snapshots recorded beginning in ${firstSeenYear}. Relatively young online footprint.`;
        }

        return {
            checked: true,
            hasSnapshots: true,
            firstSeenYear,
            firstSeenDate,
            lastSeenYear,
            lastSeenDate,
            archiveAgeYears,
            waybackUrl,
            historicalContinuity,
            riskStatus,
            summary,
            details,
        };
    } catch {
        return {
            checked: false,
            hasSnapshots: false,
            firstSeenYear: null,
            firstSeenDate: null,
            lastSeenYear: null,
            lastSeenDate: null,
            archiveAgeYears: null,
            waybackUrl,
            historicalContinuity: 'virgin',
            riskStatus: 'clean-history',
            summary: 'Archive Verification Offline',
            details: 'Wayback Machine query timed out or unreachable. You can inspect historical snapshots directly on archive.org.',
        };
    } finally {
        clearTimeout(timer);
    }
}
