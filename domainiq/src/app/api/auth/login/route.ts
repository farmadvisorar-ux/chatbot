import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loginSchema } from '@/lib/validation';
import { findUserByEmail, verifyPassword, createSessionCookie } from '@/lib/auth';
import { ADMIN_COOKIE_NAME, getAdminPasscode } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

    const rawEmail = String(body.email || '').trim().toLowerCase();
    const rawPassword = String(body.password || '').trim();
    const adminPasscode = getAdminPasscode();

    // Seamless Admin Sign In through standard login form
    if (
        rawPassword === adminPasscode &&
        (rawEmail === 'admin' || rawEmail.includes('admin') || rawEmail === 'admin@domainiq.com' || rawEmail === 'admin@prstuvw.xyz')
    ) {
        cookies().set(ADMIN_COOKIE_NAME, adminPasscode, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
        });

        return NextResponse.json({
            success: true,
            user: { id: 0, email: rawEmail || 'admin@domainiq.com', role: 'admin' },
            redirect: '/admin',
        });
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
        return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
    }

    await createSessionCookie(user);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
}
