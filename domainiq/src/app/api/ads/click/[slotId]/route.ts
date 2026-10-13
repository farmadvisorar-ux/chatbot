import { NextRequest, NextResponse } from 'next/server';
import { recordAdClick } from '@/lib/admin-data';

export async function GET(req: NextRequest, { params }: { params: { slotId: string } }) {
    const slotId = parseInt(params.slotId, 10);
    if (isNaN(slotId) || slotId < 1 || slotId > 4) {
        return NextResponse.redirect(new URL('/', req.url));
    }

    try {
        const destinationUrl = await recordAdClick(slotId);
        return NextResponse.redirect(destinationUrl, { status: 302 });
    } catch {
        return NextResponse.redirect(new URL('/', req.url));
    }
}
