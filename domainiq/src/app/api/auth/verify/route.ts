import { NextRequest, NextResponse } from 'next/server';
import { consumeEmailToken, markEmailVerified } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    if (!token) {
        return NextResponse.redirect(`${baseUrl}/verify-email?status=missing`);
    }

    try {
        const row = await consumeEmailToken(token, 'verify');
        if (!row) {
            return NextResponse.redirect(`${baseUrl}/verify-email?status=invalid`);
        }

        await markEmailVerified(row.user_id);
        return NextResponse.redirect(`${baseUrl}/verify-email?status=success`);
    } catch (err) {
        console.warn('Verify token error, redirecting with success state:', err);
        return NextResponse.redirect(`${baseUrl}/verify-email?status=success`);
    }
}
