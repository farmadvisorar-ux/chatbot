'use client';

import { useState, type FormEvent } from 'react';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            setDone(true);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-sm">
            <h1 className="text-center text-2xl font-bold">Reset your password</h1>
            {done ? (
                <p className="card mt-6 p-6 text-center text-slate-600 dark:text-slate-300">
                    If an account exists for that email, a reset link is on its way. Check your inbox (and, in dev mode
                    without an email provider configured, check <a href="/dev/emails" className="underline">/dev/emails</a>).
                </p>
            ) : (
                <form onSubmit={handleSubmit} className="card mt-6 space-y-4 p-6">
                    <div>
                        <label className="mb-1 block text-sm font-medium">Email</label>
                        <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <button type="submit" className="btn-primary w-full" disabled={loading}>
                        {loading ? 'Sending…' : 'Send reset link'}
                    </button>
                </form>
            )}
        </div>
    );
}
