import { NextRequest, NextResponse } from 'next/server';
import { signupSchema } from '@/lib/validation';
import { createUser, findUserByEmail, hashPassword, createSessionCookie, createEmailToken } from '@/lib/auth';
import { sendEmail, verifyEmailHtml } from '@/lib/mailer';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = signupSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
        }
        const { email, password } = parsed.data;

        try {
            const existing = await findUserByEmail(email);
            if (existing) {
                return NextResponse.json({ error: 'An account with that email already exists. Try signing in instead.' }, { status: 409 });
            }
        } catch {
            // DB check error, proceed
        }

        const passwordHash = await hashPassword(password);
        const user = await createUser(email, passwordHash);
        await createSessionCookie(user);

        try {
            const token = await createEmailToken(user.id, 'verify', 24 * 60 * 60 * 1000);
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
            const link = `${baseUrl}/api/auth/verify?token=${token}`;
            await sendEmail(email, 'Verify your DomainIQ account', verifyEmailHtml(link));
        } catch (mailErr) {
            console.warn('Verification email send/token failed:', mailErr);
        }

        return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
    } catch (err) {
        console.error('Signup error:', err);
        return NextResponse.json({ error: 'Unable to complete sign up at this time. Please try again.' }, { status: 500 });
    }
}
