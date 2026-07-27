import { getAuthToken } from './auth';

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, authed = false): Promise<{ data: T }> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authed) {
        const token = await getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let payload: unknown = null;
    try {
        payload = await response.json();
    } catch {
        /* Empty or non-JSON response body. */
    }
    if (!response.ok) {
        const message = (payload as { error?: string } | null)?.error || `Request failed (${response.status})`;
        throw new ApiError(response.status, message);
    }
    return { data: payload as T };
}

export const api = {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    postAuthed: <T>(path: string, body?: unknown) => request<T>('POST', path, body, true),
};
