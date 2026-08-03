import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { isValidDomain, normalizeDomain } from '@/lib/domain';

interface WatchlistRow {
    id: number;
    domain: string;
    label: string | null;
    created_at: string;
}

interface LatestValuationRow {
    mid_usd: number;
    low_usd: number;
    high_usd: number;
    confidence: string;
    created_at: string;
}

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const pool = getPool();
    const { rows } = await pool.query<WatchlistRow>(
        'SELECT id, domain, label, created_at FROM watchlist WHERE user_id = $1 ORDER BY created_at DESC',
        [session.id],
    );

    const withHistory = await Promise.all(
        rows.map(async (row) => {
            const { rows: recent } = await pool.query<LatestValuationRow>(
                'SELECT mid_usd, low_usd, high_usd, confidence, created_at FROM valuations WHERE domain = $1 ORDER BY created_at DESC LIMIT 2',
                [row.domain],
            );
            return { ...row, latest: recent[0] ?? null, previousMidUsd: recent[1]?.mid_usd ?? null };
        }),
    );

    return NextResponse.json({ items: withHistory });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const domainInput = typeof body.domain === 'string' ? body.domain : '';
    if (!isValidDomain(domainInput)) {
        return NextResponse.json({ error: 'Enter a valid domain name' }, { status: 400 });
    }
    const domain = normalizeDomain(domainInput);
    const label = typeof body.label === 'string' ? body.label.slice(0, 80) : null;

    const pool = getPool();
    const { rows } = await pool.query<{ c: string }>('SELECT COUNT(*) as c FROM watchlist WHERE user_id = $1', [session.id]);
    if (Number(rows[0]?.c ?? 0) >= 200) {
        return NextResponse.json({ error: 'Watchlist limit reached (200 domains)' }, { status: 400 });
    }

    await pool.query(
        'INSERT INTO watchlist (user_id, domain, label) VALUES ($1, $2, $3) ON CONFLICT (user_id, domain) DO NOTHING',
        [session.id, domain, label],
    );
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const domainInput = req.nextUrl.searchParams.get('domain') ?? '';
    const domain = normalizeDomain(domainInput);

    await getPool().query('DELETE FROM watchlist WHERE user_id = $1 AND domain = $2', [session.id, domain]);
    return NextResponse.json({ ok: true });
}
