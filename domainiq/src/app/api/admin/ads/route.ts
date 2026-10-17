import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { getAdSlots, updateAdSlot } from '@/lib/admin-data';

export async function GET(req: NextRequest) {
    // Reading ad configuration is public or admin
    try {
        const slots = await getAdSlots();
        return NextResponse.json({ slots });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to fetch ad slots' },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const slotId = Number(body.slotId || body.id);
        if (!slotId || slotId < 1 || slotId > 4) {
            return NextResponse.json({ error: 'Invalid slotId (must be 1, 2, 3, or 4)' }, { status: 400 });
        }

        const updated = await updateAdSlot(slotId, {
            title: body.title,
            description: body.description,
            destination_url: body.destination_url,
            image_url: body.image_url,
            cta_text: body.cta_text,
            sponsor_name: body.sponsor_name,
            badge: body.badge,
            is_active: body.is_active !== undefined ? Boolean(body.is_active) : undefined,
        });

        return NextResponse.json({ success: true, slot: updated });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to update ad slot' },
            { status: 500 },
        );
    }
}
