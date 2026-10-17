'use client';

import { useState, type FormEvent } from 'react';

export default function NewsletterSignup() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setStatus('loading');
        setError(null);
        try {
            const res = await fetch('/api/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Something went wrong');
                setStatus('error');
                return;
            }
            setStatus('done');
        } catch {
            setError('Something went wrong');
            setStatus('error');
        }
    }

    if (status === 'done') {
        return <p className="text-sm text-emerald-600 dark:text-emerald-400">You&apos;re subscribed. Look for our next issue.</p>;
    }

    return (
        <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-2 sm:flex-row">
            <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input !py-2 text-sm"
            />
            <button type="submit" className="btn-primary whitespace-nowrap !py-2 text-sm" disabled={status === 'loading'}>
                {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
            </button>
            {status === 'error' && error && <p className="text-xs text-red-600 sm:col-span-2">{error}</p>}
        </form>
    );
}
