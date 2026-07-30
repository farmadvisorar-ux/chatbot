import { NextRequest, NextResponse } from 'next/server';
import { passwordSchema } from '@/lib/validation';
import { consumeEmailToken, hashPassword, updatePassword, findUserById, createSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : null;
    const parsed = passwordSchema.safeParse(body?.password);

    if (!token || !parsed.success) {
        return NextResponse.json({ error: parsed.success ? 'Missing reset token' : parsed.error.issues[0]?.message }, { status: 400 });
    }

    const row = await consumeEmailToken(token, 'reset');
    if (!row) {
        return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(parsed.data);
    await updatePassword(row.user_id, passwordHash);

    const user = (await findUserById(row.user_id))!;
    await createSessionCookie(user);

    return NextResponse.json({ ok: true });
}
