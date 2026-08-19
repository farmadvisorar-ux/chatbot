import { getPool, isDatabaseConfigured } from './db.js';
import { SCHEMA_SQL } from './schema.js';

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
 * One attempt per process. A cold start resets it, which is the point: it
 * retries after a genuine transient failure, but a database that keeps
 * rejecting the schema will not be hammered by every request in an instance.
 */
let schemaAttempted = false;

/**
 * Creates the schema on the first request that finds it missing.
 *
 * A deployment can reach its database and still have no tables, and closing
 * that gap has required either the connection string on the operator's own
 * machine or an outbound Postgres port — neither is available everywhere this
 * gets run from. Since the application already knows how to connect, the one
 * thing it was missing was permission to fix itself.
 *
 * Deliberately not a new endpoint: this runs inside request paths that already
 * exist, so it adds no public surface and nothing here can be triggered that a
 * visitor could not already trigger by loading the homepage. The schema is
 * idempotent and contains no DROP, both asserted in tests/schema.test.mjs.
 *
 * The request that triggers it is not retried. Re-running a handler risks
 * repeating whatever it did before it failed, and no amount of care makes that
 * worth it on paths that take money — so the caller is told to try again, and
 * the next request succeeds.
 */
async function createSchemaOnce(label: string): Promise<boolean> {
    if (schemaAttempted) return false;
    try {
        if (!isDatabaseConfigured()) return false;
        await getPool().query(SCHEMA_SQL);
        // Only lock out further attempts after a successful apply. A transient
        // failure (permissions race, brief outage) must not disable recovery
        // for the rest of this process's life.
        schemaAttempted = true;
        console.log(`[${label}] schema was missing and has been created`);
        return true;
    } catch (err) {
        console.error(`[${label}] could not create the schema`, err);
        return false;
    }
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
