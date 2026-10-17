import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getPool } from '@/lib/db';
import { emailSchema } from '@/lib/validation';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const parsed = emailSchema.safeParse(body?.email);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const ip = getClientIp(req.headers);
    const { allowed } = await checkAndConsumeRateLimit(ip, 10, 'newsletter-subscribe');
    if (!allowed) {
        return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }

    const email = parsed.data;
    const pool = getPool();
    const token = crypto.randomBytes(24).toString('hex');

    // Re-subscribing after a previous unsubscribe reactivates the same row
    // (keeps a single stable unsubscribe token per email) rather than
    // erroring or creating a duplicate.
    await pool.query(
        `INSERT INTO newsletter_subscribers (email, unsubscribe_token)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL`,
        [email, token],
    );

    return NextResponse.json({ ok: true });
}
