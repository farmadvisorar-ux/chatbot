'use client';

import { useState } from 'react';

export default function ResendVerificationBanner() {
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    async function resend() {
        setLoading(true);
        try {
            await fetch('/api/auth/resend-verification', { method: 'POST' });
            setSent(true);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <span>
                {sent ? 'Verification email sent — check your inbox (or /dev/emails in dev mode).' : 'Please verify your email address.'}
            </span>
            {!sent && (
                <button onClick={resend} disabled={loading} className="btn-secondary !py-1.5 !px-3 text-sm">
                    {loading ? 'Sending…' : 'Resend verification email'}
                </button>
            )}
        </div>
    );
}
