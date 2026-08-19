import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for GitHub PATs. TOKEN_ENCRYPTION_KEY must
 * be a 32-byte key, base64-encoded (e.g. `openssl rand -base64 32`). Ciphertext
 * is stored as `iv.authTag.ciphertext`, each base64, so it's a single TEXT column.
 */
function getKey(): Buffer {
    const raw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is not configured on this deployment.');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
    return key;
}

export function encryptSecret(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
    const [ivB64, tagB64, ciphertextB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !ciphertextB64) throw new Error('Malformed encrypted payload.');
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
}
