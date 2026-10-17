import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { triggerWebhookPush } from '@/lib/admin-data';

export async function POST(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const webhookUrl = String(body.webhookUrl || '').trim();

        if (!webhookUrl || !webhookUrl.startsWith('http')) {
            return NextResponse.json({ error: 'Provide a valid HTTP/HTTPS webhook URL' }, { status: 400 });
        }

        const result = await triggerWebhookPush(webhookUrl);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Webhook push failed' },
            { status: 500 },
        );
    }
}
