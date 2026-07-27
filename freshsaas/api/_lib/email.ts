import { Resend } from 'resend';

const SENDER = 'FreshSAAS <hello@freshsaas.online>';
const REPLY_TO = 'farmadvisorar@gmail.com';

/**
 * Sends the post-signup welcome email. Never throws: the caller is the Clerk
 * webhook, and a failed courtesy email must not fail the user-record sync
 * (a non-2xx there makes Clerk retry the whole delivery). Failures are
 * logged instead — the Resend SDK reports API errors as a returned value
 * rather than throwing, so the result has to be checked explicitly or
 * delivery breaks silently.
 *
 * No-ops if RESEND_API_KEY isn't configured.
 *
 * Sends from the verified freshsaas.online domain, so delivery reaches real
 * signups. Replies go to the address above rather than the send-only sender.
 */
export async function sendWelcomeEmail(toEmail: string, name: string | null): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const greeting = name ? `Hi ${name},` : 'Hi there,';

    try {
        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
            from: SENDER,
            to: toEmail,
            replyTo: REPLY_TO,
            subject: 'Welcome to FreshSAAS',
            text: `${greeting}\n\nWelcome to FreshSAAS — you're signed up. Browse the freshest SaaS launches, or list your own product in the marketplace.\n\nQuestions? Just reply to this email.\n\n— FreshSAAS`,
        });
        if (error) {
            console.error('Welcome email was not sent:', error.name, error.message);
        }
    } catch (err) {
        console.error('Welcome email threw:', err);
    }
}
