import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { getAdPurchases, createAdPurchase, updateAdPurchase, deleteAdPurchase } from '@/lib/admin-data';

export async function GET(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const purchases = await getAdPurchases();
        return NextResponse.json({ purchases });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to fetch ad purchases' },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    // Both admin creation and public sponsor inquiries can submit
    try {
        const body = await req.json().catch(() => ({}));
        const slotId = Number(body.slot_id || body.slotId);
        if (!slotId || slotId < 1 || slotId > 4) {
            return NextResponse.json({ error: 'Please select a valid Ad Box slot (1 to 4)' }, { status: 400 });
        }

        if (!body.advertiser_name || !body.email || !body.destination_url) {
            return NextResponse.json({ error: 'Advertiser name, email, and live link are required' }, { status: 400 });
        }

        const isAuthed = await verifyAdminAccess(req);
        // If submitted by public user via /advertise, status defaults to 'pending'
        const initialStatus = isAuthed ? (body.status || 'active') : 'pending';

        const record = await createAdPurchase({
            slot_id: slotId,
            advertiser_name: String(body.advertiser_name).trim(),
            company: String(body.company || body.advertiser_name).trim(),
            email: String(body.email).trim().toLowerCase(),
            amount_usd: Number(body.amount_usd || 0),
            status: initialStatus,
            start_date: body.start_date || new Date().toISOString(),
            expiry_date: body.expiry_date || null,
            destination_url: String(body.destination_url).trim(),
            banner_image_url: body.banner_image_url ? String(body.banner_image_url).trim() : null,
            banner_title: body.banner_title ? String(body.banner_title).trim() : null,
            banner_description: body.banner_description ? String(body.banner_description).trim() : null,
            cta_text: body.cta_text ? String(body.cta_text).trim() : null,
            notes: body.notes ? String(body.notes).trim() : null,
        });

        return NextResponse.json({ success: true, purchase: record });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to create ad purchase' },
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
        const id = Number(body.id);
        if (!id) {
            return NextResponse.json({ error: 'Missing purchase id' }, { status: 400 });
        }

        const success = await updateAdPurchase(id, {
            status: body.status,
            amount_usd: body.amount_usd !== undefined ? Number(body.amount_usd) : undefined,
            destination_url: body.destination_url,
            banner_image_url: body.banner_image_url,
            banner_title: body.banner_title,
            banner_description: body.banner_description,
            cta_text: body.cta_text,
            notes: body.notes,
        });

        return NextResponse.json({ success });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to update purchase' },
            { status: 500 },
        );
    }
}

export async function DELETE(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = Number(searchParams.get('id'));
        if (!id) {
            return NextResponse.json({ error: 'Missing purchase id query param' }, { status: 400 });
        }

        const success = await deleteAdPurchase(id);
        return NextResponse.json({ success });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to delete purchase' },
            { status: 500 },
        );
    }
}
