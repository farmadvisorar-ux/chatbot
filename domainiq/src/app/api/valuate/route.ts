import { NextRequest, NextResponse } from 'next/server';
import { performValuation } from '@/lib/valuation-request';

async function handle(domainInput: string | null) {
    if (!domainInput) {
        return NextResponse.json({ error: 'Missing "domain" parameter' }, { status: 400 });
    }

    try {
        const { result, remainingFree, error, status } = await performValuation(domainInput);
        if (error) {
            return NextResponse.json({ error }, { status: status ?? 400 });
        }
        return NextResponse.json({ result, remainingFree });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Evaluation failed' },
            { status: 500 },
        );
    }
}

export async function GET(req: NextRequest) {
    return handle(req.nextUrl.searchParams.get('domain'));
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    return handle(body.domain ?? null);
}
