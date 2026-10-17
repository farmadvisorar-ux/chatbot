import Link from 'next/link';

const MESSAGES: Record<string, { title: string; body: string }> = {
    success: { title: 'Email verified 🎉', body: 'Your email is confirmed. You now have full access to DomainIQ.' },
    invalid: { title: 'Link expired or already used', body: 'Request a new verification email from your dashboard.' },
    missing: { title: 'Missing verification token', body: 'Use the link from your verification email.' },
};

export default function VerifyEmailPage({ searchParams }: { searchParams: { status?: string } }) {
    const status = searchParams.status ?? 'missing';
    const msg = MESSAGES[status] ?? MESSAGES.missing!;

    return (
        <div className="mx-auto max-w-sm text-center">
            <h1 className="text-2xl font-bold">{msg.title}</h1>
            <p className="mt-3 text-slate-500">{msg.body}</p>
            <Link href="/dashboard" className="btn-primary mt-6 inline-flex">Go to dashboard</Link>
        </div>
    );
}
