import { put } from '@vercel/blob';

const DATA_URL = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,(.+)$/;

export function isConfigured(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

const EXT_FOR: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
};

/** Decodes a data: URL captured from `<input type="file">` and stores it in Blob. */
export async function storePhoto(leadId: string, dataUrl: string): Promise<string> {
    const match = DATA_URL.exec(dataUrl);
    if (!match) throw new Error('Unsupported image format. Use JPEG, PNG, WEBP or HEIC.');
    const [, mime, base64] = match as unknown as [string, string, string];
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.byteLength > 12 * 1024 * 1024) throw new Error('Photo is too large (12MB max).');

    const ext = EXT_FOR[mime] ?? 'jpg';
    const pathname = `roofsignal/${leadId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(pathname, buffer, {
        access: 'public',
        contentType: mime,
        token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
}
