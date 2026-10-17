'use client';

import Link from 'next/link';
import DomainCheckerForm from '@/components/DomainCheckerForm';

export default function GlobalAppError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="mx-auto max-w-2xl py-16 text-center space-y-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-400 font-mono font-black text-lg border border-brand-500/30">
                IQ
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Instant Domain Appraisal Terminal
            </h1>
            <p className="text-sm text-slate-400">
                Enter any domain name below for an instant multi-channel valuation report.
            </p>
            <div className="mx-auto max-w-xl text-left">
                <DomainCheckerForm autoFocus={true} />
            </div>
            <div className="flex justify-center gap-3 pt-2">
                <button onClick={() => reset()} className="btn-secondary text-xs">
                    Retry Request
                </button>
                <Link href="/" className="btn-primary text-xs">
                    Return Home
                </Link>
            </div>
        </div>
    );
}
