'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLoginPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Authentication failed');
            } else {
                router.push('/admin');
                router.refresh();
            }
        } catch {
            setError('Network error. Check connection and retry.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md space-y-6">
                {/* Brand Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white font-mono text-xl shadow-xl shadow-brand-500/30 font-black mb-1">
                        IQ
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">
                        Domain<span className="text-brand-400">IQ</span> Admin Terminal
                    </h1>
                    <p className="text-xs text-slate-400 font-mono">
                        System Management • Live Feed Push • Ad Box Operations
                    </p>
                </div>

                {/* Login Card */}
                <div className="card p-6 sm:p-8 rounded-2xl border-brand-500/30 bg-slate-900/90 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />

                    <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                        <div className="space-y-2">
                            <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                                Terminal Passcode
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter admin passcode..."
                                autoFocus
                                required
                                className="input w-full font-mono text-sm tracking-widest bg-slate-950 border-slate-800 focus:border-brand-500"
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-mono">
                                ⚠ {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="btn-primary w-full py-3 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
                        >
                            {loading ? 'Authenticating...' : 'Unlock Admin Terminal →'}
                        </button>

                        <div className="pt-2 border-t border-slate-800/80">
                            <button
                                type="button"
                                onClick={() => setPassword('domainiq-admin-2026')}
                                className="w-full text-center text-[11px] font-mono text-slate-400 hover:text-brand-300 transition-colors py-1"
                            >
                                ⚡ Fill Default Passcode (<span className="text-slate-300">domainiq-admin-2026</span>)
                            </button>
                        </div>
                    </form>
                </div>

                {/* Return to Public Site */}
                <div className="text-center">
                    <Link
                        href="/"
                        className="text-xs font-mono text-slate-400 hover:text-white transition-colors"
                    >
                        ← Return to DomainIQ Public Terminal
                    </Link>
                </div>
            </div>
        </div>
    );
}
