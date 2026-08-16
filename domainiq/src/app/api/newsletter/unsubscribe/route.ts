import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    if (!token) {
        return NextResponse.redirect(`${baseUrl}/unsubscribe?status=missing`);
    }

    const { rowCount } = await getPool().query(
        `UPDATE newsletter_subscribers SET unsubscribed_at = now() WHERE unsubscribe_token = $1 AND unsubscribed_at IS NULL`,
        [token],
    );

    return NextResponse.redirect(`${baseUrl}/unsubscribe?status=${rowCount && rowCount > 0 ? 'success' : 'invalid'}`);
}
