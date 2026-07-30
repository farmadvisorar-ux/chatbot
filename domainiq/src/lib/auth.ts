import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { getPool } from './db';

const SESSION_COOKIE = 'domainiq_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error('AUTH_SECRET is not set. Copy .env.example to .env and set a random value.');
    }
    return new TextEncoder().encode(secret);
}

export interface SessionUser {
    id: number;
    email: string;
    plan: string;
    emailVerified: boolean;
}

export interface UserRow {
    id: number;
    email: string;
    password_hash: string;
    email_verified_at: string | null;
    plan: string;
    created_at: string;
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
    const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    return rows[0];
}

export async function findUserById(id: number): Promise<UserRow | undefined> {
    const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0];
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
    const { rows } = await getPool().query<UserRow>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
        [email.toLowerCase().trim(), passwordHash],
    );
    return rows[0]!;
}

function toSessionUser(row: UserRow): SessionUser {
    return { id: row.id, email: row.email, plan: row.plan, emailVerified: Boolean(row.email_verified_at) };
}

export async function createSessionCookie(user: UserRow): Promise<void> {
    const token = await new SignJWT({ sub: String(user.id), email: user.email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(getSecret());

    cookies().set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
    });
}

export function clearSessionCookie(): void {
    cookies().delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
    const token = cookies().get(SESSION_COOKIE)?.value;
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, getSecret());
        const userId = Number(payload.sub);
        const row = await findUserById(userId);
        if (!row) return null;
        return toSessionUser(row);
    } catch {
        return null;
    }
}

export async function createEmailToken(userId: number, type: 'verify' | 'reset', ttlMs: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await getPool().query(
        'INSERT INTO email_tokens (user_id, token, type, expires_at) VALUES ($1, $2, $3, $4)',
        [userId, token, type, expiresAt],
    );
    return token;
}

export interface EmailTokenRow {
    id: number;
    user_id: number;
    token: string;
    type: 'verify' | 'reset';
    expires_at: string;
    used_at: string | null;
}

export async function consumeEmailToken(token: string, type: 'verify' | 'reset'): Promise<EmailTokenRow | null> {
    const pool = getPool();
    const { rows } = await pool.query<EmailTokenRow>('SELECT * FROM email_tokens WHERE token = $1 AND type = $2', [token, type]);
    const row = rows[0];
    if (!row) return null;
    if (row.used_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    await pool.query("UPDATE email_tokens SET used_at = now() WHERE id = $1", [row.id]);
    return row;
}

export async function markEmailVerified(userId: number): Promise<void> {
    await getPool().query('UPDATE users SET email_verified_at = now() WHERE id = $1', [userId]);
}

export async function updatePassword(userId: number, passwordHash: string): Promise<void> {
    await getPool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}
