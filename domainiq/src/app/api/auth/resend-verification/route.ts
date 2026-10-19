import { NextRequest, NextResponse } from 'next/server';
import { getSession, findUserById, createEmailToken } from '@/lib/auth';
import { sendEmail, verifyEmailHtml } from '@/lib/mailer';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
        if (session.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

        const user = await findUserById(session.id);
        if (user) {
            try {
                const token = await createEmailToken(user.id, 'verify', 24 * 60 * 60 * 1000);
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
                const link = `${baseUrl}/api/auth/verify?token=${token}`;
                await sendEmail(user.email, 'Verify your DomainIQ account', verifyEmailHtml(link));
            } catch (err) {
                console.warn('Resend verification email failed:', err);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('Resend verification error:', err);
        return NextResponse.json({ ok: true });
    }
}
