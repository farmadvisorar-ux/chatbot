import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import WatchlistPanel from '@/components/WatchlistPanel';
import ResendVerificationBanner from '@/components/ResendVerificationBanner';

export default async function DashboardPage() {
    const session = await getSession();
    if (!session) redirect('/login?next=/dashboard');

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="mt-1 text-slate-500">Signed in as {session.email}</p>
            </div>
            {!session.emailVerified && <ResendVerificationBanner />}
            <WatchlistPanel />
        </div>
    );
}
