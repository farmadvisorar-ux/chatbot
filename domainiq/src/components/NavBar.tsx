import Link from 'next/link';
import { getSession } from '@/lib/auth';
import LogoutButton from './LogoutButton';
import MobileNavMenu from './MobileNavMenu';

export default async function NavBar() {
    const session = await getSession();

    return (
        <header className="relative border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sticky top-0 z-40">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
                <Link href="/" className="flex items-center gap-2 font-bold text-lg">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">IQ</span>
                    DomainIQ
                </Link>
                <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
                    <Link href="/" className="hover:text-brand-600">Valuate</Link>
                    <Link href="/compare" className="hover:text-brand-600">Compare</Link>
                    <Link href="/bulk" className="hover:text-brand-600">Bulk Check</Link>
                    <Link href="/suggest" className="hover:text-brand-600">Name Ideas</Link>
                    <Link href="/how-it-works" className="hover:text-brand-600">Methodology</Link>
                    <Link href="/pricing" className="hover:text-brand-600">Pricing</Link>
                    {session && <Link href="/dashboard" className="hover:text-brand-600">Dashboard</Link>}
                </nav>
                <div className="flex items-center gap-3">
                    {session ? (
                        <>
                            <span className="hidden text-sm text-slate-500 sm:inline">{session.email}</span>
                            <LogoutButton />
                        </>
                    ) : (
                        <>
                            <Link href="/login" className="btn-secondary !px-3 !py-1.5 text-sm">Sign in</Link>
                            <Link href="/signup" className="btn-primary !px-3 !py-1.5 text-sm">Sign up free</Link>
                        </>
                    )}
                    <MobileNavMenu showDashboard={Boolean(session)} />
                </div>
            </div>
        </header>
    );
}
