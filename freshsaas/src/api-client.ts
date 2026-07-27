export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ data: T }> {
    const response = await fetch(path, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
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
};
