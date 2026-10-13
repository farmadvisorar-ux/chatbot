import Link from 'next/link';
import { getSession } from '@/lib/auth';
import LogoutButton from './LogoutButton';
import MobileNavMenu from './MobileNavMenu';

export default async function NavBar() {
    const session = await getSession();

    return (
        <header className="relative border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40 transition-colors">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
                {/* Logo & Brand Mark */}
                <Link href="/" className="flex items-center gap-2.5 font-extrabold text-lg tracking-tight group">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-indigo-600 to-brand-700 text-white shadow-md shadow-brand-500/30 group-hover:shadow-brand-400/50 transition-all duration-300">
                        {/* Glow effect */}
                        <div className="absolute inset-0 rounded-xl bg-brand-400 opacity-0 blur-sm group-hover:opacity-40 transition-opacity" />
                        <span className="relative font-mono font-black text-xs tracking-wider">IQ</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-white group-hover:text-brand-300 transition-colors">Domain<span className="text-brand-400">IQ</span></span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-semibold tracking-wider">
                            v2.5
                        </span>
                    </div>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden items-center gap-5 text-xs font-semibold text-slate-300 lg:flex">
                    <Link href="/" className="hover:text-brand-400 transition-colors">Valuate</Link>
                    <Link href="/compare" className="hover:text-brand-400 transition-colors">Compare</Link>
                    <Link href="/bulk" className="hover:text-brand-400 transition-colors">Bulk Portfolio</Link>
                    <Link href="/drops" className="hover:text-brand-400 transition-colors">Drop Radar</Link>
                    <Link href="/extension" className="hover:text-brand-400 transition-colors">Extension</Link>
                    <Link href="/api-docs" className="hover:text-brand-400 transition-colors">API Docs</Link>
                    <Link href="/how-it-works" className="hover:text-brand-400 transition-colors">Methodology</Link>
                    <Link href="/pricing" className="hover:text-brand-400 transition-colors">Pricing</Link>
                    {session && <Link href="/dashboard" className="hover:text-brand-400 transition-colors">Dashboard</Link>}
                </nav>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-2.5">
                    {session ? (
                        <>
                            <span className="hidden text-xs text-slate-400 sm:inline font-mono">{session.email}</span>
                            <LogoutButton />
                        </>
                    ) : (
                        <>
                            <Link href="/login" className="btn-secondary !px-3 !py-1.5 text-xs font-semibold">
                                Sign in
                            </Link>
                            <Link href="/signup" className="btn-primary !px-3.5 !py-1.5 text-xs font-semibold shadow-brand-500/20">
                                Sign up free
                            </Link>
                        </>
                    )}
                    <MobileNavMenu showDashboard={Boolean(session)} />
                </div>
            </div>
        </header>
    );
}
