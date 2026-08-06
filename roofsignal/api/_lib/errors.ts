import { getPool, isDatabaseConfigured } from './db.ts';
import { SCHEMA_SQL } from './schema.ts';

/**
 * Turns a thrown database error into something an operator can act on,
 * instead of every failure surfacing as a generic FUNCTION_INVOCATION_FAILED.
 */
export function describeDbError(err: unknown): { status: number; message: string } {
    const code = (err as { code?: string } | null)?.code;

    if (code === '42P01') {
        return {
            status: 503,
            message: 'The database is connected but empty. Run `npm run migrate` against it to create the tables.',
        };
    }
    if (code === '28P01' || code === '28000' || code === '3D000') {
        return { status: 503, message: "The database rejected this deployment's credentials. Check the connection string." };
    }
    if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
        return { status: 503, message: 'The database is unreachable from this deployment.' };
    }
    return { status: 500, message: 'The database request failed.' };
}

/** One schema-creation attempt per warm process; a cold start resets it. */
let schemaAttempted = false;

async function createSchemaOnce(label: string): Promise<boolean> {
    if (schemaAttempted) return false;
    schemaAttempted = true;
    try {
        if (!isDatabaseConfigured()) return false;
        await getPool().query(SCHEMA_SQL);
        console.log(`[${label}] schema was missing and has been created`);
        return true;
    } catch (err) {
        console.error(`[${label}] could not create the schema`, err);
        return false;
    }
}

/**
 * Runs a handler and converts anything it throws into a described response.
 * On a missing-table error it also tries to create the schema once, so a
 * freshly attached database heals itself on the first request instead of
 * needing a separate manual migration step.
 */
export async function guarded(
    label: string,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    run: () => Promise<void>,
): Promise<void> {
    try {
        await run();
    } catch (err) {
        const code = (err as { code?: string } | null)?.code;

        if (code === '42P01' && await createSchemaOnce(label)) {
            res.status(503).json({
                error: 'The database has just been set up. Retry this request.',
                initialised: true,
            });
            return;
        }

        console.error(`[${label}]`, err);
        const { status, message } = describeDbError(err);
        res.status(status).json({ error: message });
    }
}
