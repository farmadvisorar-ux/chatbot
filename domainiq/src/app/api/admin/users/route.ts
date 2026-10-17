import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { getAdminUsers, updateAdminUser } from '@/lib/admin-data';

export async function GET(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const users = await getAdminUsers();
        return NextResponse.json({ users });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to fetch users' },
            { status: 500 },
        );
    }
}

export async function PATCH(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const userId = Number(body.userId);
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
        }

        const success = await updateAdminUser(userId, {
            plan: body.plan,
            verified: body.verified,
        });

        return NextResponse.json({ success });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to update user' },
            { status: 500 },
        );
    }
}
