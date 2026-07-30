import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { isValidDomain, normalizeDomain } from '@/lib/domain';

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const db = getDb();
    const rows = db
        .prepare('SELECT id, domain, label, created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC')
        .all(session.id) as { id: number; domain: string; label: string | null; created_at: string }[];

    const withHistory = rows.map((row) => {
        const latest = db
            .prepare('SELECT mid_usd, low_usd, high_usd, confidence, created_at FROM valuations WHERE domain = ? ORDER BY created_at DESC LIMIT 1')
            .get(row.domain) as { mid_usd: number; low_usd: number; high_usd: number; confidence: string; created_at: string } | undefined;
        const previous = db
            .prepare('SELECT mid_usd FROM valuations WHERE domain = ? ORDER BY created_at DESC LIMIT 1 OFFSET 1')
            .get(row.domain) as { mid_usd: number } | undefined;
        return { ...row, latest: latest ?? null, previousMidUsd: previous?.mid_usd ?? null };
    });

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

    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as c FROM watchlist WHERE user_id = ?').get(session.id) as { c: number }).c;
    if (count >= 200) {
        return NextResponse.json({ error: 'Watchlist limit reached (200 domains)' }, { status: 400 });
    }

    db.prepare('INSERT OR IGNORE INTO watchlist (user_id, domain, label) VALUES (?, ?, ?)').run(session.id, domain, label);
    return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const domainInput = req.nextUrl.searchParams.get('domain') ?? '';
    const domain = normalizeDomain(domainInput);

    getDb().prepare('DELETE FROM watchlist WHERE user_id = ? AND domain = ?').run(session.id, domain);
    return NextResponse.json({ ok: true });
}
