'use client';

import { useState, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginInner() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Something went wrong');
                return;
            }
            router.push(searchParams.get('next') || '/dashboard');
            router.refresh();
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-sm">
            <h1 className="text-center text-2xl font-bold">Sign in</h1>
            <form onSubmit={handleSubmit} className="card mt-6 space-y-4 p-6">
                <div>
                    <label className="mb-1 block text-sm font-medium">Email</label>
                    <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium">Password</label>
                    <input type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
                <Link href="/forgot-password" className="hover:underline">Forgot password?</Link>
            </p>
            <p className="mt-2 text-center text-sm text-slate-500">
                No account? <Link href="/signup" className="font-medium text-brand-600 hover:underline">Sign up free</Link>
            </p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginInner />
        </Suspense>
    );
}
