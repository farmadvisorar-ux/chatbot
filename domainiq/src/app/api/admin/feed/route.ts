import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { getLivePushFeed } from '@/lib/admin-data';

/**
 * Live Link Push to GET Endpoint.
 * External webhooks, dashboards, or automation workflows can hit this URL directly
 * via GET request: `/api/admin/feed?key=YOUR_ADMIN_PASSWORD`
 */
export async function GET(req: NextRequest) {
    const isAuthed = await verifyAdminAccess(req);
    if (!isAuthed) {
        return NextResponse.json(
            { error: 'Unauthorized. Provide valid admin cookie or ?key=YOUR_ADMIN_PASSWORD in query parameter.' },
            { status: 401 },
        );
    }

    try {
        const feed = await getLivePushFeed();
        const { searchParams } = new URL(req.url);
        const format = searchParams.get('format');

        // Optional CSV format export
        if (format === 'csv') {
            const header = 'id,email,plan,email_verified_at,created_at\n';
            const rows = feed.recentUsers
                .map((u) => `${u.id},"${u.email}",${u.plan},${u.email_verified_at || 'unverified'},${u.created_at}`)
                .join('\n');
            return new NextResponse(header + rows, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="domainiq_signups.csv"',
                },
            });
        }

        return NextResponse.json(feed, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to generate live push feed' },
            { status: 500 },
        );
    }
}
