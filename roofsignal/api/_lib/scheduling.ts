import type pg from 'pg';

/** Mon-Sat, 8am-5pm, Central time (the territory has no other time zone). */
function isBusinessHour(date: Date): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        hour12: false,
        weekday: 'short',
    }).formatToParts(date);
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0') % 24;
    const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
    if (weekday === 'Sun') return false;
    return hour >= 8 && hour < 17;
}

/**
 * Finds the next open 60-minute inspection slot on or after `fromDate`,
 * scanning hour-aligned candidates within business hours and skipping any
 * that overlap an existing scheduled appointment. Scans up to two weeks
 * ahead before giving up.
 */
export async function findNextSlot(
    pool: pg.Pool,
    fromDate: Date = new Date(),
): Promise<{ start: Date; end: Date }> {
    let candidate = new Date(fromDate);
    candidate.setUTCMinutes(0, 0, 0);
    if (candidate <= fromDate) candidate = new Date(candidate.getTime() + 60 * 60 * 1000);

    for (let i = 0; i < 24 * 14; i++) {
        if (isBusinessHour(candidate)) {
            const end = new Date(candidate.getTime() + 60 * 60 * 1000);
            const { rows } = await pool.query(
                `SELECT 1 FROM appointments
                 WHERE status = 'scheduled' AND starts_at < $2 AND ends_at > $1
                 LIMIT 1`,
                [candidate.toISOString(), end.toISOString()],
            );
            if (rows.length === 0) return { start: candidate, end };
        }
        candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
    }
    throw new Error('No available inspection slot found in the next two weeks');
}
