import { NextRequest, NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validation';
import { findUserByEmail, verifyPassword, createSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const user = findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
        return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
    }

    await createSessionCookie(user);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
}
