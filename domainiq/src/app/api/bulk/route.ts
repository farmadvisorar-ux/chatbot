import { NextRequest, NextResponse } from 'next/server';
import { evaluateDomain, recordValuation } from '@/lib/valuation/engine';
import { isValidDomain } from '@/lib/domain';
import { getSession } from '@/lib/auth';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const domains: unknown = body.domains;
    if (!Array.isArray(domains) || domains.length === 0) {
        return NextResponse.json({ error: 'Provide a non-empty "domains" array' }, { status: 400 });
    }

    const session = await getSession();
    const maxBatch = session ? 200 : 10;

    if (!session) {
        const ip = getClientIp(req.headers);
        const { allowed } = await checkAndConsumeRateLimit(ip, 3, 'bulk');
        if (!allowed) {
            return NextResponse.json({ error: 'Free anonymous bulk-check limit reached for today. Sign up (free) for larger batches.' }, { status: 429 });
        }
    }

    const list = (domains as unknown[])
        .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
        .slice(0, maxBatch);

    const results = await Promise.all(
        list.map(async (raw) => {
            if (!isValidDomain(raw)) {
                return { domain: raw, error: 'Invalid domain' };
            }
            try {
                const result = await evaluateDomain(raw, { lookupAge: false });
                await recordValuation(result);
                return { domain: result.domain, result };
            } catch (err) {
                return { domain: raw, error: err instanceof Error ? err.message : 'Valuation failed' };
            }
        }),
    );

    return NextResponse.json({ results, maxBatch, truncated: (domains as unknown[]).length > maxBatch });
}
