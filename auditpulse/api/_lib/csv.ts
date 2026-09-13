/**
 * RFC 4180 CSV, with two deliberate departures that matter for a file whose
 * whole purpose is to be opened in Excel, Sheets or Numbers.
 *
 * 1. Formula injection. A cell starting with = + - @ (or tab/CR, which some
 *    parsers strip before evaluating) is executed as a formula by every major
 *    spreadsheet. Our cells carry attacker-influenced text — a page title, a
 *    URL, a server banner copied verbatim from the audited site — so a
 *    finding could otherwise ship a working =HYPERLINK() or DDE payload into
 *    a customer's spreadsheet. Every such cell is prefixed with a single
 *    quote, which spreadsheets treat as "the rest is literal text".
 *
 * 2. CRLF line endings, because Excel on Windows still splits on them and
 *    renders a bare LF file as one long row.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let text = Array.isArray(value) ? value.join(' ') : String(value);
    if (FORMULA_LEAD.test(text)) text = `'${text}`;
    if (NEEDS_QUOTING.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
    const lines = [headers.map(escapeCell).join(',')];
    for (const row of rows) lines.push(row.map(escapeCell).join(','));
    // Trailing newline: POSIX tools and `wc -l` both expect the last record to
    // be terminated, and no spreadsheet reads it as an extra blank row.
    return `${lines.join('\r\n')}\r\n`;
}

/** A filename-safe slug, so `Content-Disposition` never needs escaping and never produces a path. */
export function filenameSlug(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';
}
