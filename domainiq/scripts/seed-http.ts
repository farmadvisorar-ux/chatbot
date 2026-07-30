// Seeds the comparable-sales dataset over Neon's HTTP driver instead of a
// raw TCP connection — same rationale as migrate-http.mjs. Only works
// against Neon databases; other providers should use `npm run seed`
// (scripts/seed.ts) from a TCP-capable environment instead.
import { neon } from '@neondatabase/serverless';
import { COMPS } from './seed-data';
import { extractTld, rootLabel } from '../src/lib/domain';

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

for (const row of COMPS) {
    await sql(
        `INSERT INTO comps (domain, tld, sale_price_usd, sale_year, word_count, char_count, category, source_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (domain) DO UPDATE SET
            tld = excluded.tld,
            sale_price_usd = excluded.sale_price_usd,
            sale_year = excluded.sale_year,
            word_count = excluded.word_count,
            char_count = excluded.char_count,
            category = excluded.category,
            source_note = excluded.source_note`,
        [
            row.domain,
            extractTld(row.domain),
            row.salePriceUsd,
            row.saleYear,
            row.wordCount,
            rootLabel(row.domain).length,
            row.category,
            row.sourceNote,
        ],
    );
}

console.log(`Seeded ${COMPS.length} comparable sales via HTTP driver.`);
