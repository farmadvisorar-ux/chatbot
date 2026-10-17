'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SaveToWatchlistButton({ domain, signedIn, initiallySaved }: { domain: string; signedIn: boolean; initiallySaved: boolean }) {
    const [saved, setSaved] = useState(initiallySaved);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    if (!signedIn) {
        return (
            <button onClick={() => router.push(`/signup?next=/valuation/${encodeURIComponent(domain)}`)} className="btn-secondary">
                Sign up to save &amp; track
            </button>
        );
    }

    async function toggle() {
        setLoading(true);
        try {
            if (saved) {
                await fetch(`/api/watchlist?domain=${encodeURIComponent(domain)}`, { method: 'DELETE' });
                setSaved(false);
            } else {
                await fetch('/api/watchlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain }),
                });
                setSaved(true);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <button onClick={toggle} disabled={loading} className={saved ? 'btn-secondary' : 'btn-primary'}>
            {loading ? 'Saving…' : saved ? '✓ Saved to watchlist' : '+ Save to watchlist'}
        </button>
    );
}
