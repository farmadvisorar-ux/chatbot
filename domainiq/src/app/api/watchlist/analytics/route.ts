import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Breakdown {
    tld: string;
    vertical?: { label: string };
}

interface AggBucket {
    label: string;
    valueUsd: number;
    count: number;
}

const MAX_BUCKETS = 7;

function aggregate(rows: { key: string; valueUsd: number }[]): AggBucket[] {
    const map = new Map<string, AggBucket>();
    for (const row of rows) {
        const existing = map.get(row.key);
        if (existing) {
            existing.valueUsd += row.valueUsd;
            existing.count += 1;
        } else {
            map.set(row.key, { label: row.key, valueUsd: row.valueUsd, count: 1 });
        }
    }
    const sorted = [...map.values()].sort((a, b) => b.valueUsd - a.valueUsd);
    if (sorted.length <= MAX_BUCKETS) return sorted;

    const top = sorted.slice(0, MAX_BUCKETS - 1);
    const rest = sorted.slice(MAX_BUCKETS - 1);
    const other: AggBucket = {
        label: 'Other',
        valueUsd: rest.reduce((sum, b) => sum + b.valueUsd, 0),
        count: rest.reduce((sum, b) => sum + b.count, 0),
    };
    return [...top, other];
}

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const pool = getPool();
    const { rows: watchlistRows } = await pool.query<{ domain: string }>(
        'SELECT domain FROM watchlist WHERE user_id = $1',
        [session.id],
    );

    const verticalRows: { key: string; valueUsd: number }[] = [];
    const tldRows: { key: string; valueUsd: number }[] = [];
    let totalValueUsd = 0;
    let priced = 0;

    for (const { domain } of watchlistRows) {
        const { rows } = await pool.query<{ mid_usd: number; breakdown_json: Breakdown }>(
            'SELECT mid_usd, breakdown_json FROM valuations WHERE domain = $1 ORDER BY created_at DESC LIMIT 1',
            [domain],
        );
        const latest = rows[0];
        if (!latest) continue;

        totalValueUsd += latest.mid_usd;
        priced += 1;
        verticalRows.push({ key: latest.breakdown_json.vertical?.label ?? 'Unclassified', valueUsd: latest.mid_usd });
        tldRows.push({ key: `.${latest.breakdown_json.tld}`, valueUsd: latest.mid_usd });
    }

    return NextResponse.json({
        totalValueUsd,
        domainCount: watchlistRows.length,
        pricedCount: priced,
        byVertical: aggregate(verticalRows),
        byTld: aggregate(tldRows),
    });
}
