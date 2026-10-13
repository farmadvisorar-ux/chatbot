import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, getAdminPasscode, verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    return NextResponse.json({ authenticated: isAuthed });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const password = String(body.password || '').trim();
        const expected = getAdminPasscode();

        if (password !== expected) {
            return NextResponse.json({ error: 'Invalid admin passcode' }, { status: 401 });
        }

        // Set secure admin cookie (7 days)
        cookies().set(ADMIN_COOKIE_NAME, expected, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
        });

        return NextResponse.json({ success: true, message: 'Admin authenticated' });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Authentication failed' },
            { status: 500 },
        );
    }
}

export async function DELETE() {
    cookies().delete(ADMIN_COOKIE_NAME);
    return NextResponse.json({ success: true, message: 'Admin logged out' });
}
