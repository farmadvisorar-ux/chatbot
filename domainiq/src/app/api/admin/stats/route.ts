import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { getAdminStats } from '@/lib/admin-data';

export async function GET(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const stats = await getAdminStats();
        return NextResponse.json({ stats });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to fetch stats' },
            { status: 500 },
        );
    }
}
