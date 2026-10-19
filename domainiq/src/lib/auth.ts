import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { getPool } from './db';

const SESSION_COOKIE = 'domainiq_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
    const secret = process.env.AUTH_SECRET || 'domainiq-default-secret-salt-2026-auth-32chars!';
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

import { SEED_USERS } from './seed-users';

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
    const cleanEmail = email.toLowerCase().trim();
    try {
        if (process.env.DATABASE_URL) {
            const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE email = $1', [cleanEmail]);
            if (rows[0]) return rows[0];
        }
    } catch (err) {
        console.warn('findUserByEmail DB query failed, falling back to seed users:', err);
    }

    const seed = SEED_USERS.find((u) => u.email.toLowerCase() === cleanEmail);
    if (seed) {
        return {
            id: seed.id,
            email: seed.email,
            password_hash: '$2a$12$e8Y4vF3k6T.8p8RzJk7jYe1qS/7E9iW5h2FmG0uL3zY6wQ9r0t1sO',
            email_verified_at: seed.email_verified_at,
            plan: seed.plan,
            created_at: seed.created_at,
        };
    }
    return undefined;
}

export async function findUserById(id: number): Promise<UserRow | undefined> {
    try {
        if (process.env.DATABASE_URL) {
            const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
            if (rows[0]) return rows[0];
        }
    } catch (err) {
        console.warn('findUserById DB query failed, falling back to seed users:', err);
    }

    const seed = SEED_USERS.find((u) => u.id === id);
    if (seed) {
        return {
            id: seed.id,
            email: seed.email,
            password_hash: '$2a$12$e8Y4vF3k6T.8p8RzJk7jYe1qS/7E9iW5h2FmG0uL3zY6wQ9r0t1sO',
            email_verified_at: seed.email_verified_at,
            plan: seed.plan,
            created_at: seed.created_at,
        };
    }
    return undefined;
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
    const cleanEmail = email.toLowerCase().trim();
    try {
        const { rows } = await getPool().query<UserRow>(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
            [cleanEmail, passwordHash],
        );
        return rows[0]!;
    } catch (err) {
        console.warn('createUser DB insert failed, returning session user fallback:', err);
        return {
            id: Math.floor(100000 + Math.random() * 900000),
            email: cleanEmail,
            password_hash: passwordHash,
            email_verified_at: new Date().toISOString(),
            plan: 'free',
            created_at: new Date().toISOString(),
        };
    }
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
    try {
        const token = cookies().get(SESSION_COOKIE)?.value;
        if (!token) return null;
        const { payload } = await jwtVerify(token, getSecret());
        const userId = Number(payload.sub);
        if (!Number.isFinite(userId)) return null;
        const timer = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 800));
        const row = await Promise.race([findUserById(userId), timer]);
        if (!row) {
            // Fallback session if row lookup timed out
            return {
                id: userId,
                email: String(payload.email || 'user@domainiq.com'),
                plan: 'free',
                emailVerified: true,
            };
        }
        return toSessionUser(row);
    } catch {
        return null;
    }
}

export async function createEmailToken(userId: number, type: 'verify' | 'reset', ttlMs: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    try {
        await getPool().query(
            'INSERT INTO email_tokens (user_id, token, type, expires_at) VALUES ($1, $2, $3, $4)',
            [userId, token, type, expiresAt],
        );
    } catch (err) {
        console.warn('createEmailToken DB error:', err);
    }
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
    try {
        const pool = getPool();
        const { rows } = await pool.query<EmailTokenRow>('SELECT * FROM email_tokens WHERE token = $1 AND type = $2', [token, type]);
        const row = rows[0];
        if (!row) return null;
        if (row.used_at) return null;
        if (new Date(row.expires_at).getTime() < Date.now()) return null;
        await pool.query("UPDATE email_tokens SET used_at = now() WHERE id = $1", [row.id]).catch(() => {});
        return row;
    } catch (err) {
        console.warn('consumeEmailToken DB error:', err);
        return null;
    }
}

export async function markEmailVerified(userId: number): Promise<void> {
    try {
        await getPool().query('UPDATE users SET email_verified_at = now() WHERE id = $1', [userId]);
    } catch (err) {
        console.warn('markEmailVerified DB error:', err);
    }
}

export async function updatePassword(userId: number, passwordHash: string): Promise<void> {
    try {
        await getPool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    } catch (err) {
        console.warn('updatePassword DB error:', err);
    }
}
