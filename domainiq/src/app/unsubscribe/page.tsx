import Link from 'next/link';

const MESSAGES: Record<string, { title: string; body: string }> = {
    success: { title: 'You’re unsubscribed', body: 'You won’t receive any more newsletter emails from DomainIQ.' },
    invalid: { title: 'Link already used or invalid', body: 'This unsubscribe link has already been used, or the token is invalid.' },
    missing: { title: 'Missing unsubscribe token', body: 'Use the unsubscribe link from the email you received.' },
};

export default function UnsubscribePage({ searchParams }: { searchParams: { status?: string } }) {
    const status = searchParams.status ?? 'missing';
    const msg = MESSAGES[status] ?? MESSAGES.missing!;

    return (
        <div className="mx-auto max-w-sm text-center">
            <h1 className="text-2xl font-bold">{msg.title}</h1>
            <p className="mt-3 text-slate-500">{msg.body}</p>
            <Link href="/" className="btn-primary mt-6 inline-flex">Back to DomainIQ</Link>
        </div>
    );
}
