import type { CheckDefinition, Finding } from '../types.js';
import { safeFetch } from '../net.js';

const CANDIDATE_PATHS = ['/graphql', '/api/graphql', '/graphql/console', '/v1/graphql'];
const INTROSPECTION_QUERY = JSON.stringify({ query: '{__schema{queryType{name}}}' });

/**
 * A GraphQL introspection query is a normal, read-only query — the same
 * request GraphiQL/Apollo Studio sends to build their schema explorer, not
 * an exploit. Sending one is how you find out introspection is enabled at
 * all; it doesn't read or change any application data.
 */
export const graphqlIntrospectionCheck: CheckDefinition = {
    id: 'graphql-introspection',
    tier: 'full',
    async run(ctx): Promise<Finding[]> {
        const findings: Finding[] = [];
        const base = ctx.targetUrl.replace(/\/$/, '');

        for (const path of CANDIDATE_PATHS) {
            const res = await safeFetch(base + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: INTROSPECTION_QUERY,
                timeoutMs: Math.min(ctx.timeoutMs, 5000),
            }).catch(() => null);
            if (!res || res.status !== 200) continue;

            const body = await res.text().catch(() => '');
            if (!body.includes('queryType')) continue;
            let parsed: unknown;
            try { parsed = JSON.parse(body); } catch { continue; }
            const hasSchema = Boolean((parsed as { data?: { __schema?: unknown } })?.data?.__schema);
            if (!hasSchema) continue;

            findings.push({
                checkId: 'graphql-introspection',
                title: `GraphQL introspection is enabled at ${path}`,
                severity: 'medium',
                impact: 'Introspection hands anyone your entire API blueprint — every field, type, and mutation your app supports — turning "guess how the API works" into "read the full manual," which makes finding other bugs in it much easier.',
                description: `A standard introspection query to ${path} returned a valid schema, meaning anyone can enumerate your full GraphQL API surface (queries, mutations, types, fields) without credentials.`,
                remediation: 'Disable introspection in production (most GraphQL servers have a single config flag for this — e.g. `introspection: false` in Apollo Server), or require authentication before it\'s exposed.',
                references: ['https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/12-API_Testing/01-Testing_GraphQL'],
                affectedUrl: base + path,
            });
            break; // one instance is enough to make the point
        }

        return findings;
    },
};
