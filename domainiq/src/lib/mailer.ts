import { Resend } from 'resend';

export interface SentEmail {
    to: string;
    subject: string;
    html: string;
    sentAt: string;
    delivered: boolean;
}

// In dev / without a RESEND_API_KEY, emails are captured here instead of
// sent, so signup/verification/reset flows are fully testable end-to-end
// with zero paid services. Visit /dev/emails to read them.
const devOutbox: SentEmail[] = [];

export function getDevOutbox(): SentEmail[] {
    return devOutbox;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'DomainIQ <onboarding@resend.dev>';

    if (!apiKey) {
        console.log(`[mailer] (dev mode, no RESEND_API_KEY) would send "${subject}" to ${to}`);
        devOutbox.unshift({ to, subject, html, sentAt: new Date().toISOString(), delivered: false });
        if (devOutbox.length > 50) devOutbox.length = 50;
        return;
    }

    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to, subject, html });
    devOutbox.unshift({ to, subject, html, sentAt: new Date().toISOString(), delivered: true });
    if (devOutbox.length > 50) devOutbox.length = 50;
}

export function verifyEmailHtml(link: string): string {
    return `<p>Welcome to DomainIQ! Confirm your email to unlock unlimited free valuations, saved watchlists and portfolio tracking.</p>
    <p><a href="${link}">Verify your email</a></p>
    <p>If you didn't create this account, you can ignore this message.</p>`;
}

export function resetPasswordHtml(link: string): string {
    return `<p>We received a request to reset your DomainIQ password.</p>
    <p><a href="${link}">Choose a new password</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can ignore this message.</p>`;
}
