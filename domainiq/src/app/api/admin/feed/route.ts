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

        // Full CSV format export of all registered users
        if (format === 'csv') {
            const allUsers = await (await import('@/lib/admin-data')).getAdminUsers();
            const header = 'id,name,email,plan,status,valuations,watchlist,created_at\n';
            const rows = allUsers
                .map(
                    (u) =>
                        `${u.id},"${(u.name || '').replace(/"/g, '""')}","${u.email}",${u.plan},${
                            u.email_verified_at ? 'verified' : 'pending'
                        },${u.valuationsCount || 0},${u.watchlistCount || 0},${u.created_at}`,
                )
                .join('\n');
            return new NextResponse(header + rows, {
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': 'attachment; filename="domainiq_643_users.csv"',
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
