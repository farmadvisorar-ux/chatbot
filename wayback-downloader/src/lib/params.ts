// Everything runs in the browser now (no server to configure via env
// vars), so this is just a sane hard ceiling on a single run.
export const MAX_FILES_DEFAULT = 1000;

export interface JobParams {
    domain: string;
    fromTs: string | null;
    toTs: string | null;
    exactUrl: boolean;
    onlyStatus200: boolean;
    allSnapshots: boolean;
    extensions: string[];
    onlyPattern: string | null;
    excludePattern: string | null;
    maxFiles: number;
}

export class BadRequest extends Error {}

function optStr(payload: Record<string, unknown>, name: string, maxLen: number): string | null {
    const raw = payload[name];
    if (raw === undefined || raw === null) return null;
    const val = String(raw).trim();
    if (!val) return null;
    if (val.length > maxLen) throw new BadRequest(`'${name}' is too long.`);
    return val;
}

export function parseParams(payload: Record<string, unknown>): JobParams {
    const domain = String(payload.domain ?? '').trim();
    if (!domain) throw new BadRequest('Please enter a domain or URL, e.g. example.com');
    if (domain.length > 500) throw new BadRequest('That URL is too long.');

    const fromTs = optStr(payload, 'fromTs', 14);
    const toTs = optStr(payload, 'toTs', 14);
    if (fromTs && !/^\d{4,14}$/.test(fromTs)) throw new BadRequest("'From' date must look like YYYYMMDD.");
    if (toTs && !/^\d{4,14}$/.test(toTs)) throw new BadRequest("'To' date must look like YYYYMMDD.");

    const onlyPattern = optStr(payload, 'onlyPattern', 300);
    const excludePattern = optStr(payload, 'excludePattern', 300);
    for (const pattern of [onlyPattern, excludePattern]) {
        if (!pattern) continue;
        try {
            // eslint-disable-next-line no-new
            new RegExp(pattern);
        } catch (err) {
            throw new BadRequest(`Invalid regular expression: ${(err as Error).message}`);
        }
    }

    const rawExtensions = payload.extensions;
    if (rawExtensions !== undefined && !Array.isArray(rawExtensions)) {
        throw new BadRequest("'extensions' must be a list of strings.");
    }
    const extensions = ((rawExtensions as unknown[] | undefined) ?? [])
        .map((e) => String(e).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10))
        .filter(Boolean);

    const maxFilesRaw = Number(payload.maxFiles ?? MAX_FILES_DEFAULT);
    if (!Number.isFinite(maxFilesRaw)) throw new BadRequest("'maxFiles' must be a number.");
    const maxFiles = Math.max(1, Math.min(Math.round(maxFilesRaw), MAX_FILES_DEFAULT));

    return {
        domain,
        fromTs,
        toTs,
        exactUrl: Boolean(payload.exactUrl),
        onlyStatus200: payload.onlyStatus200 === undefined ? true : Boolean(payload.onlyStatus200),
        allSnapshots: Boolean(payload.allSnapshots),
        extensions,
        onlyPattern,
        excludePattern,
        maxFiles,
    };
}
