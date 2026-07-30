import { NextRequest, NextResponse } from 'next/server';
import { getSession, findUserById, createEmailToken } from '@/lib/auth';
import { sendEmail, verifyEmailHtml } from '@/lib/mailer';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (session.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

    const user = (await findUserById(session.id))!;
    const token = await createEmailToken(user.id, 'verify', 24 * 60 * 60 * 1000);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
    const link = `${baseUrl}/api/auth/verify?token=${token}`;
    await sendEmail(user.email, 'Verify your DomainIQ account', verifyEmailHtml(link));

    return NextResponse.json({ ok: true });
}
