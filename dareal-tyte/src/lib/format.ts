const FULL_TIMESTAMP_RE = /^\d{14}$/;

export function formatTimestamp(timestamp: string): string {
    if (!FULL_TIMESTAMP_RE.test(timestamp)) return timestamp;

    const y = timestamp.slice(0, 4);
    const m = timestamp.slice(4, 6);
    const d = timestamp.slice(6, 8);
    const hh = timestamp.slice(8, 10) || '00';
    const mm = timestamp.slice(10, 12) || '00';
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}
