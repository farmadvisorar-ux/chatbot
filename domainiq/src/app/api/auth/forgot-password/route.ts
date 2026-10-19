import { NextRequest, NextResponse } from 'next/server';
import { emailSchema } from '@/lib/validation';
import { findUserByEmail, createEmailToken } from '@/lib/auth';
import { sendEmail, resetPasswordHtml } from '@/lib/mailer';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = emailSchema.safeParse(body?.email);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
        }

        const user = await findUserByEmail(parsed.data);
        if (user) {
            try {
                const token = await createEmailToken(user.id, 'reset', 60 * 60 * 1000);
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
                const link = `${baseUrl}/reset-password?token=${token}`;
                await sendEmail(user.email, 'Reset your DomainIQ password', resetPasswordHtml(link));
            } catch (err) {
                console.warn('Reset email send failed:', err);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Forgot password error:', err);
        return NextResponse.json({ ok: true });
    }
}
