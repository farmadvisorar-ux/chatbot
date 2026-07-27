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

/**
 * Tells a founder their submitted project is now live in the directory.
 *
 * Only ever sent to an address the founder typed into the submission form
 * themselves, which is what makes it a transactional reply rather than
 * unsolicited mail. Never call this with an address discovered by scraping.
 */
export async function sendListedEmail(toEmail: string, productName: string, productUrl: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    try {
        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
            from: SENDER,
            to: toEmail,
            replyTo: REPLY_TO,
            subject: `${productName} is now listed on FreshSAAS`,
            text: `Good news — ${productName} is now live in the FreshSAAS launch directory.\n\nYou can see it at https://freshsaas.online\n\nYou're getting this because you submitted ${productUrl} to FreshSAAS. If that wasn't you, just reply and we'll remove the listing.\n\n— FreshSAAS`,
        });
        if (error) {
            console.error('Listing email was not sent:', error.name, error.message);
        }
    } catch (err) {
        console.error('Listing email threw:', err);
    }
}

/**
 * Digest to the site owner after an ingest run. Goes only to ADMIN_EMAIL,
 * so it carries none of the consent concerns of mailing listed founders.
 */
export async function sendAdminDigest(summary: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!apiKey || !adminEmail) return;

    try {
        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
            from: SENDER,
            to: adminEmail,
            replyTo: REPLY_TO,
            subject: 'FreshSAAS: new launches added',
            text: `${summary}\n\nBrowse them at https://freshsaas.online\n\n— FreshSAAS automation`,
        });
        if (error) {
            console.error('Admin digest was not sent:', error.name, error.message);
        }
    } catch (err) {
        console.error('Admin digest threw:', err);
    }
}
