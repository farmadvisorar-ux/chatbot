import { NextRequest, NextResponse } from 'next/server';
import { signupSchema } from '@/lib/validation';
import { createUser, findUserByEmail, hashPassword, createSessionCookie, createEmailToken } from '@/lib/auth';
import { sendEmail, verifyEmailHtml } from '@/lib/mailer';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { email, password } = parsed.data;

    if (findUserByEmail(email)) {
        return NextResponse.json({ error: 'An account with that email already exists. Try signing in instead.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = createUser(email, passwordHash);
    await createSessionCookie(user);

    const token = createEmailToken(user.id, 'verify', 24 * 60 * 60 * 1000);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
    const link = `${baseUrl}/api/auth/verify?token=${token}`;
    await sendEmail(email, 'Verify your DomainIQ account', verifyEmailHtml(link));

    return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
}
