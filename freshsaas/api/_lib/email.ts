import { Resend } from 'resend';

const SENDER = 'FreshSAAS <onboarding@resend.dev>';
const REPLY_TO = 'farmadvisorar@gmail.com';

/**
 * Sends the post-signup welcome email. Silently no-ops if RESEND_API_KEY
 * isn't configured, so auth still works before email is set up.
 *
 * Note: without a verified sending domain in Resend, the `onboarding@resend.dev`
 * sender can only deliver to the Resend account's own verified address — real
 * signups won't receive this until a domain is added and verified in Resend.
 * See freshsaas/README.md for the upgrade path.
 */
export async function sendWelcomeEmail(toEmail: string, name: string | null): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const resend = new Resend(apiKey);
    const greeting = name ? `Hi ${name},` : 'Hi there,';

    await resend.emails.send({
        from: SENDER,
        to: toEmail,
        replyTo: REPLY_TO,
        subject: 'Welcome to FreshSAAS',
        text: `${greeting}\n\nWelcome to FreshSAAS — you're signed up. Browse the freshest SaaS launches, or list your own product in the marketplace.\n\nQuestions? Just reply to this email.\n\n— FreshSAAS`,
    });
}
