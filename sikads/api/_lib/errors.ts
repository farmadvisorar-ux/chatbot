/**
 * Turns a thrown database error into something an operator can act on.
 *
 * Without this every failure surfaces as FUNCTION_INVOCATION_FAILED, which is
 * indistinguishable from a code bug and says nothing about which of the setup
 * steps was skipped. The three cases below are the ones that actually happen
 * while wiring a deployment up, and each has a different fix.
 *
 * Messages stay deliberately free of hostnames, usernames and connection
 * strings: they are returned to the public, and "which database" is not
 * something a visitor needs to know to understand that the site is misbuilt.
 */
export function describeDbError(err: unknown): { status: number; message: string } {
    const code = (err as { code?: string } | null)?.code;

    // 42P01 undefined_table — connected fine, but the schema was never applied.
    if (code === '42P01') {
        return {
            status: 503,
            message: 'The database is connected but empty. Run `npm run migrate` against it to create the tables.',
        };
    }

    // Authentication and permission failures: the URL is set but wrong.
    if (code === '28P01' || code === '28000' || code === '3D000') {
        return {
            status: 503,
            message: 'The database rejected this deployment\'s credentials. Check the connection string.',
        };
    }

    // Network-level: unreachable, refused, timed out, DNS.
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
        return { status: 503, message: 'The database is unreachable from this deployment.' };
    }

    return { status: 500, message: 'The database request failed.' };
}

/**
 * Runs a handler and converts anything it throws into a described response.
 * Full detail goes to the server log, where it is safe to be specific.
 */
export async function guarded(
    label: string,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    run: () => Promise<void>,
): Promise<void> {
    try {
        await run();
    } catch (err) {
        console.error(`[${label}]`, err);
        const { status, message } = describeDbError(err);
        res.status(status).json({ error: message });
    }
}
