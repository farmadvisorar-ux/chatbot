'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function handleLogout() {
        setLoading(true);
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
    }

    return (
        <button onClick={handleLogout} disabled={loading} className="btn-secondary !px-3 !py-1.5 text-sm">
            {loading ? 'Signing out…' : 'Sign out'}
        </button>
    );
}
