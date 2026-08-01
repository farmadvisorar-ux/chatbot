/**
 * Job state lives in Vercel Blob as a small JSON document, since Vercel
 * serverless functions share no memory between invocations. Each poll from
 * the browser (`tick`) reads the current state, downloads a batch of
 * snapshots, and writes the state back — so at most one write is ever in
 * flight per job as long as the client awaits each tick before the next.
 */
import { put, list, del } from '@vercel/blob';
import type { Snapshot } from './cdx.js';
import type { JobParams } from './params.js';

export type JobStatus = 'queued' | 'downloading' | 'done' | 'error' | 'cancelled';

export interface FileEntry {
    name: string;
    url: string;
    size: number;
}

export interface LogEntry {
    type: 'ok' | 'error' | 'skip';
    url: string;
    message?: string;
}

export interface JobState {
    id: string;
    createdAt: number;
    params: JobParams;
    status: JobStatus;
    message: string;
    error: string | null;
    cursor: number;
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    snapshots: Snapshot[];
    files: FileEntry[];
    recentEvents: LogEntry[];
    cancelRequested: boolean;
}

const MAX_LOG_ENTRIES = 60;
const statePath = (id: string) => `jobs/${id}/state.json`;
export const filePath = (id: string, relPath: string) => `jobs/${id}/files/${relPath}`;

export function newJobState(id: string, params: JobParams): JobState {
    return {
        id,
        createdAt: Date.now(),
        params,
        status: 'queued',
        message: 'Queued...',
        error: null,
        cursor: 0,
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        snapshots: [],
        files: [],
        recentEvents: [],
        cancelRequested: false,
    };
}

export function pushLog(state: JobState, entry: LogEntry): void {
    state.recentEvents.push(entry);
    if (state.recentEvents.length > MAX_LOG_ENTRIES) {
        state.recentEvents = state.recentEvents.slice(-MAX_LOG_ENTRIES);
    }
}

export async function saveJobState(state: JobState): Promise<void> {
    // addRandomSuffix: false keeps the pathname stable across ticks, which
    // this SDK version overwrites in place rather than erroring.
    await put(statePath(state.id), JSON.stringify(state), {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json',
        cacheControlMaxAge: 0,
    });
}

export async function loadJobState(id: string): Promise<JobState | null> {
    const { blobs } = await list({ prefix: statePath(id), limit: 1 });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as JobState;
}

/** The `snapshots` array can be large and is only needed internally by
 * `tick` to know what's left to download — strip it before sending state
 * to the browser. */
export function toPublicJobState(state: JobState): Omit<JobState, 'snapshots'> {
    return {
        id: state.id,
        createdAt: state.createdAt,
        params: state.params,
        status: state.status,
        message: state.message,
        error: state.error,
        cursor: state.cursor,
        total: state.total,
        completed: state.completed,
        failed: state.failed,
        skipped: state.skipped,
        files: state.files,
        recentEvents: state.recentEvents,
        cancelRequested: state.cancelRequested,
    };
}

/** Deletes every blob belonging to a job (state + downloaded files). */
export async function deleteJob(id: string): Promise<void> {
    let cursor: string | undefined;
    const urls: string[] = [];
    do {
        const page = await list({ prefix: `jobs/${id}/`, cursor, limit: 1000 });
        urls.push(...page.blobs.map((b) => b.url));
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (urls.length > 0) await del(urls);
}
