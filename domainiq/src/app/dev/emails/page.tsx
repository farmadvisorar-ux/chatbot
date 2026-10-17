import { getDevOutbox } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export default function DevEmailsPage() {
    if (process.env.NODE_ENV === 'production' && process.env.RESEND_API_KEY) {
        return <p className="text-center text-slate-500">Not available — email is configured for real delivery.</p>;
    }

    const outbox = getDevOutbox();

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Dev outbox</h1>
                <p className="mt-1 text-sm text-slate-500">
                    No RESEND_API_KEY is configured, so verification/reset emails are captured here instead of sent.
                </p>
            </div>
            {outbox.length === 0 ? (
                <p className="text-slate-400">No emails yet.</p>
            ) : (
                outbox.map((email, i) => (
                    <div key={i} className="card p-4">
                        <p className="text-sm text-slate-400">
                            To: {email.to} · {new Date(email.sentAt).toLocaleString()}
                        </p>
                        <p className="font-semibold">{email.subject}</p>
                        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: email.html }} />
                    </div>
                ))
            )}
        </div>
    );
}
