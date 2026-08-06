import { gunzipSync } from 'node:zlib';
import pg from 'pg';
import { parse } from 'csv-parse/sync';
import { isRoofRelevantEventType } from '../api/_lib/stormData.ts';

/**
 * Ingests real severe-weather history from NOAA/NCEI's public Storm Events
 * Database (free, no API key, no login — see roofsignal/README.md) for the
 * four parishes this territory actually spans, and upserts it into
 * storm_events. Run this once after first deploying, then let
 * .github/workflows/roofsignal-storm-data.yml re-run it monthly — NOAA
 * revises recent months' records for a while after they happen, so a
 * one-time run goes stale.
 *
 * Source: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/
 * Format: https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/Storm-Data-Bulk-csv-Format.pdf
 */

const LISTING_URL = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/';

// The territory spans four real parishes (see api/_lib/geo.ts) — Louisiana
// state FIPS 22, county/parish FIPS below. NOAA's CZ_TYPE='C' rows key
// storms to a county/parish exactly like this.
const STATE_FIPS = '22';
const TARGET_COUNTY_FIPS = new Set([15, 17, 31, 119]); // Bossier, Caddo, DeSoto, Webster

const now = new Date();
const START_YEAR = Number(process.env.STORM_START_YEAR) || now.getUTCFullYear() - 10;
const END_YEAR = Number(process.env.STORM_END_YEAR) || now.getUTCFullYear();

const URL_VARS = [
    'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING',
];
const foundVar = URL_VARS.find(name => process.env[name]);
if (!foundVar) {
    console.error(`No database connection string found. Set one of:\n  ${URL_VARS.join('\n  ')}`);
    process.exit(1);
}
const conn = process.env[foundVar];
const ssl = /[?&]sslmode=disable/.test(conn) || /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(conn)
    ? false
    : { rejectUnauthorized: false };
const pool = new pg.Pool({ connectionString: conn, ssl });

async function findYearFiles() {
    console.log(`Listing ${LISTING_URL} …`);
    const response = await fetch(LISTING_URL);
    if (!response.ok) throw new Error(`Directory listing failed: HTTP ${response.status}`);
    const html = await response.text();

    // e.g. StormEvents_details-ftp_v1.0_d2024_c20250115.csv.gz — the c-date
    // (creation date) changes whenever NOAA revises a year's file, so more
    // than one filename can exist per year; the highest c-date is the latest.
    const pattern = /StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d{8})\.csv\.gz/g;
    const latestByYear = new Map();
    for (const match of html.matchAll(pattern)) {
        const [filename, year, cdate] = match;
        const y = Number(year);
        if (y < START_YEAR || y > END_YEAR) continue;
        const existing = latestByYear.get(y);
        if (!existing || cdate > existing.cdate) latestByYear.set(y, { filename, cdate });
    }
    return latestByYear;
}

function toIsoDate(yearMonth, day) {
    const year = yearMonth.slice(0, 4);
    const month = yearMonth.slice(4, 6);
    return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

function toNullableNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

async function ingestYear(year, filename) {
    const url = `${LISTING_URL}${filename}`;
    console.log(`Fetching ${filename} …`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
    const gz = Buffer.from(await response.arrayBuffer());
    const csv = gunzipSync(gz).toString('utf8');

    const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });

    let matched = 0;
    let upserted = 0;
    for (const row of rows) {
        if (row.STATE_FIPS !== STATE_FIPS) continue;
        if (row.CZ_TYPE !== 'C') continue;
        const countyFips = Number(row.CZ_FIPS);
        if (!TARGET_COUNTY_FIPS.has(countyFips)) continue;
        if (!isRoofRelevantEventType(row.EVENT_TYPE)) continue;
        matched += 1;

        const sourceEventId = Number(row.EVENT_ID);
        if (!Number.isFinite(sourceEventId)) continue;

        await pool.query(
            `INSERT INTO storm_events
                (source_event_id, event_date, event_type, magnitude, magnitude_type, county_fips, county_name, narrative)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (source_event_id) DO UPDATE SET
                event_date = EXCLUDED.event_date, event_type = EXCLUDED.event_type,
                magnitude = EXCLUDED.magnitude, magnitude_type = EXCLUDED.magnitude_type,
                county_fips = EXCLUDED.county_fips, county_name = EXCLUDED.county_name,
                narrative = EXCLUDED.narrative`,
            [
                sourceEventId,
                toIsoDate(row.BEGIN_YEARMONTH, row.BEGIN_DAY),
                row.EVENT_TYPE,
                toNullableNumber(row.MAGNITUDE),
                row.MAGNITUDE_TYPE || null,
                countyFips,
                // Titlecase from NOAA's all-caps CZ_NAME (e.g. "CADDO" -> "Caddo").
                row.CZ_NAME.charAt(0) + row.CZ_NAME.slice(1).toLowerCase(),
                (row.EVENT_NARRATIVE || row.EPISODE_NARRATIVE || '').trim(),
            ],
        );
        upserted += 1;
    }
    console.log(`  ${year}: ${rows.length} total events, ${matched} in-territory & roof-relevant, ${upserted} upserted`);
    return upserted;
}

try {
    const yearFiles = await findYearFiles();
    if (yearFiles.size === 0) {
        console.error(`No storm data files found for ${START_YEAR}-${END_YEAR} at ${LISTING_URL}`);
        process.exit(1);
    }
    let total = 0;
    for (const [year, { filename }] of [...yearFiles.entries()].sort((a, b) => a[0] - b[0])) {
        total += await ingestYear(year, filename);
    }
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM storm_events');
    console.log(`\nDone. ${total} events upserted this run. storm_events now has ${rows[0].count} rows total.`);
} catch (err) {
    console.error('Storm data fetch failed:', err);
    process.exitCode = 1;
} finally {
    await pool.end();
}
