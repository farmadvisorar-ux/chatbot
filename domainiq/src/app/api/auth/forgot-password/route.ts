import { NextRequest, NextResponse } from 'next/server';
import { emailSchema } from '@/lib/validation';
import { findUserByEmail, createEmailToken } from '@/lib/auth';
import { sendEmail, resetPasswordHtml } from '@/lib/mailer';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const parsed = emailSchema.safeParse(body?.email);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const user = await findUserByEmail(parsed.data);
    // Always respond with the same success message, whether or not the
    // account exists, so this endpoint can't be used to enumerate emails.
    if (user) {
        const token = await createEmailToken(user.id, 'reset', 60 * 60 * 1000);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
        const link = `${baseUrl}/reset-password?token=${token}`;
        await sendEmail(user.email, 'Reset your DomainIQ password', resetPasswordHtml(link));
    }

    return NextResponse.json({ ok: true });
}
