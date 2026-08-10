/**
 * Split db/schema.sql into statements safe to send one-at-a-time over Neon's
 * HTTP endpoint (one statement per call).
 *
 * Leading `--` comment lines are stripped rather than used to drop the whole
 * chunk — otherwise a CREATE TABLE that starts with a documentation comment
 * never runs, and the subsequent CREATE INDEX fails on a missing table.
 */
export function splitSchemaStatements(schema) {
    return schema
        .split(/;\s*\n/)
        .map(chunk => chunk
            .split('\n')
            .filter(line => !/^\s*--/.test(line))
            .join('\n')
            .trim())
        .filter(statement => statement.length > 0);
}
