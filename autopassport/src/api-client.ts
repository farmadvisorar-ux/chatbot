export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

type RequestOptions = {
    authToken?: string;
    signal?: AbortSignal;
};

async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options: RequestOptions = {},
): Promise<{ data: T }> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.authToken) headers['Authorization'] = `Bearer ${options.authToken}`;

    const response = await fetch(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: options.signal,
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
    get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
};
