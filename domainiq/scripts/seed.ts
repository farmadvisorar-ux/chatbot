import { getDb } from '../src/lib/db';
import { COMPS } from './seed-data';
import { extractTld, rootLabel } from '../src/lib/domain';

const db = getDb();

const insert = db.prepare(`
    INSERT INTO comps (domain, tld, sale_price_usd, sale_year, word_count, char_count, category, source_note)
    VALUES (@domain, @tld, @salePriceUsd, @saleYear, @wordCount, @charCount, @category, @sourceNote)
    ON CONFLICT(domain) DO UPDATE SET
        tld = excluded.tld,
        sale_price_usd = excluded.sale_price_usd,
        sale_year = excluded.sale_year,
        word_count = excluded.word_count,
        char_count = excluded.char_count,
        category = excluded.category,
        source_note = excluded.source_note
`);

const insertMany = db.transaction((rows: typeof COMPS) => {
    for (const row of rows) {
        insert.run({
            domain: row.domain,
            tld: extractTld(row.domain),
            salePriceUsd: row.salePriceUsd,
            saleYear: row.saleYear,
            wordCount: row.wordCount,
            charCount: rootLabel(row.domain).length,
            category: row.category,
            sourceNote: row.sourceNote,
        });
    }
});

insertMany(COMPS);

console.log(`Seeded ${COMPS.length} comparable sales into ${process.env.DATABASE_PATH || './data/domainiq.sqlite'}`);
