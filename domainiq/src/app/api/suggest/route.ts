import { NextRequest, NextResponse } from 'next/server';
import { generateCandidates } from '@/lib/valuation/suggestions';
import { bestKeywordMatch } from '@/lib/valuation/keywords';
import { evaluateDomain } from '@/lib/valuation/engine';
import { getSession } from '@/lib/auth';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/rate-limit';

const DEFAULT_TLDS = ['com', 'io', 'ai'];

async function handleSuggest(seedInput: string | null, requestedTld: string | null, req: NextRequest) {
    const seed = typeof seedInput === 'string' ? seedInput.trim().toLowerCase() : '';

    if (!seed || !/^[a-z0-9]+$/i.test(seed)) {
        return NextResponse.json({ error: 'Enter a plain keyword (letters/numbers only, no dots or spaces)' }, { status: 400 });
    }

    try {
        const session = await getSession();
        if (!session) {
            const ip = getClientIp(req.headers);
            const { allowed } = await checkAndConsumeRateLimit(ip, 20, 'suggest');
            if (!allowed) {
                return NextResponse.json({ error: 'Free anonymous suggestion limit reached for today. Sign up (free) for unlimited use.' }, { status: 429 });
            }
        }
    } catch {
        // Continue if session or rate limit check errors
    }

    const keywordMatch = bestKeywordMatch(seed);
    const candidates = generateCandidates(seed, keywordMatch?.category ?? null, 8);
    const cleanTld = requestedTld ? requestedTld.replace(/^\./, '').toLowerCase() : null;
    const tlds = cleanTld ? [cleanTld] : DEFAULT_TLDS;

    // Spread each candidate across the TLD list round-robin rather than
    // every candidate x every TLD, so the result set stays a manageable size.
    const pairs = candidates.map((c, i) => ({ candidate: c, tld: tlds[i % tlds.length]! }));

    const results = await Promise.all(
        pairs.map(async ({ candidate, tld }) => {
            const domain = `${candidate}.${tld}`;
            try {
                const result = await evaluateDomain(domain, { lookupAge: false, checkTrademark: false, lookupArchive: false });
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
            if (a.registered !== b.registered) return a.registered ? 1 : -1;
            return b.linguisticScore - a.linguisticScore;
        });

    return NextResponse.json({ seed, category: keywordMatch?.category ?? null, suggestions });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const seed = typeof body.seed === 'string' ? body.seed : typeof body.q === 'string' ? body.q : null;
        const tld = typeof body.tld === 'string' ? body.tld : null;
        return await handleSuggest(seed, tld, req);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Suggestion synthesis failed' },
            { status: 500 },
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        const seed = req.nextUrl.searchParams.get('seed') || req.nextUrl.searchParams.get('q');
        const tld = req.nextUrl.searchParams.get('tld');
        return await handleSuggest(seed, tld, req);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Suggestion synthesis failed' },
            { status: 500 },
        );
    }
}

