'use client';

import { useState, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function SignupInner() {
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
            const res = await fetch('/api/auth/signup', {
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
            <h1 className="text-center text-2xl font-bold">Create your free account</h1>
            <p className="mt-2 text-center text-sm text-slate-500">
                Save domains, track price history, and check up to 200 domains at once.
            </p>
            <form onSubmit={handleSubmit} className="card mt-6 space-y-4 p-6">
                <div>
                    <label className="mb-1 block text-sm font-medium">Email</label>
                    <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium">Password</label>
                    <input
                        type="password"
                        required
                        minLength={8}
                        className="input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                    {loading ? 'Creating account…' : 'Sign up free'}
                </button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
                Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
            </p>
        </div>
    );
}

export default function SignupPage() {
    return (
        <Suspense>
            <SignupInner />
        </Suspense>
    );
}
