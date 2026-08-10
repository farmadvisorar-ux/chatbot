/**
 * Splits a .sql file into individual statements for endpoints that take one
 * statement per call (Neon's HTTP endpoint, unlike a real session).
 *
 * Statements are separated on a terminator that ends a line, which keeps the
 * CHECK constraints inside a CREATE TABLE intact. Full-line `--` comments are
 * stripped from each statement rather than used to decide whether to keep it:
 * a statement preceded by a comment block (which is most of them in
 * db/schema.sql) begins with `--` after trimming, and dropping those on that
 * basis silently discards the CREATE TABLE that follows.
 */
export function splitSqlStatements(schema) {
    return schema
        .split(/;\s*\n/)
        .map(statement =>
            statement
                .split('\n')
                .filter(line => !line.trim().startsWith('--'))
                .join('\n')
                .trim(),
        )
        .filter(statement => statement.length > 0);
}
