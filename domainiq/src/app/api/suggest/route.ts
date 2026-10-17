import { NextRequest, NextResponse } from 'next/server';
import { generateCandidates } from '@/lib/valuation/suggestions';
import { bestKeywordMatch } from '@/lib/valuation/keywords';
import { evaluateDomain } from '@/lib/valuation/engine';
import { getSession } from '@/lib/auth';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/rate-limit';

const DEFAULT_TLDS = ['com', 'io', 'ai'];

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const seed = typeof body.seed === 'string' ? body.seed.trim() : '';
    const requestedTld = typeof body.tld === 'string' ? body.tld.replace(/^\./, '').toLowerCase() : null;

    if (!seed || !/^[a-z0-9]+$/i.test(seed)) {
        return NextResponse.json({ error: 'Enter a plain keyword (letters/numbers only, no dots or spaces)' }, { status: 400 });
    }

    const session = await getSession();
    if (!session) {
        const ip = getClientIp(req.headers);
        const { allowed } = await checkAndConsumeRateLimit(ip, 5, 'suggest');
        if (!allowed) {
            return NextResponse.json({ error: 'Free anonymous suggestion limit reached for today. Sign up (free) for unlimited use.' }, { status: 429 });
        }
    }

    const keywordMatch = bestKeywordMatch(seed);
    const candidates = generateCandidates(seed, keywordMatch?.category ?? null, 8);
    const tlds = requestedTld ? [requestedTld] : DEFAULT_TLDS;

    // Spread each candidate across the TLD list round-robin rather than
    // every candidate x every TLD, so the result set stays a manageable
    // size (and a manageable number of RDAP lookups) regardless of how
    // many TLDs are requested.
    const pairs = candidates.map((c, i) => ({ candidate: c, tld: tlds[i % tlds.length]! }));

    const results = await Promise.all(
        pairs.map(async ({ candidate, tld }) => {
            const domain = `${candidate}.${tld}`;
            try {
                const result = await evaluateDomain(domain, { lookupAge: true, checkTrademark: false });
                return {
                    domain: result.domain,
                    midUsd: result.midUsd,
                    confidence: result.confidence,
                    linguisticScore: result.linguisticScore,
                    registered: result.age?.registered ?? null,
                };
            } catch {
                return null;
            }
        }),
    );

    const suggestions = results
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => {
            // Prefer domains that appear available to register, then by score.
            if (a.registered !== b.registered) return a.registered ? 1 : -1;
            return b.linguisticScore - a.linguisticScore;
        });

    return NextResponse.json({ seed, category: keywordMatch?.category ?? null, suggestions });
}
