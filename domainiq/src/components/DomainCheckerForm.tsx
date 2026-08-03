'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function DomainCheckerForm({ autoFocus = true, size = 'lg' }: { autoFocus?: boolean; size?: 'lg' | 'md' }) {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const domain = value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
        if (!domain || !domain.includes('.')) {
            setError('Enter a domain like example.com');
            return;
        }
        setError(null);
        router.push(`/valuation/${encodeURIComponent(domain)}`);
    }

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="flex flex-col gap-3 sm:flex-row">
                <input
                    className={`input ${size === 'lg' ? 'text-lg py-3.5' : ''}`}
                    placeholder="yourdomain.com"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                />
                <button type="submit" className={`btn-primary whitespace-nowrap ${size === 'lg' ? 'text-lg px-6' : ''}`}>
                    Get free valuation
                </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>
    );
}
