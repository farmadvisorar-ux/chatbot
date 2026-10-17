import { getPool } from '../src/lib/db';
import { COMPS } from './seed-data';
import { extractTld, rootLabel } from '../src/lib/domain';

async function main() {
    const pool = getPool();

    for (const row of COMPS) {
        await pool.query(
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

    console.log(`Seeded ${COMPS.length} comparable sales into ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@')}`);
    await pool.end();
}

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
});
