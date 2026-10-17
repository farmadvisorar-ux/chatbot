'use client';

import { useState, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetInner() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') ?? '';
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Something went wrong');
                return;
            }
            router.push('/dashboard');
            router.refresh();
        } finally {
            setLoading(false);
        }
    }

    if (!token) {
        return <p className="mx-auto max-w-sm text-center text-slate-500">Missing reset token. Use the link from your email.</p>;
    }

    return (
        <div className="mx-auto max-w-sm">
            <h1 className="text-center text-2xl font-bold">Choose a new password</h1>
            <form onSubmit={handleSubmit} className="card mt-6 space-y-4 p-6">
                <div>
                    <label className="mb-1 block text-sm font-medium">New password</label>
                    <input
                        type="password"
                        required
                        minLength={8}
                        className="input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                    {loading ? 'Saving…' : 'Reset password'}
                </button>
            </form>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense>
            <ResetInner />
        </Suspense>
    );
}
