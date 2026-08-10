/**
 * The cron endpoint accepts a GitHub OIDC token instead of a shared secret,
 * so these check that it fails closed: forged signatures, tokens minted for
 * another repository, and wrong audiences must all be rejected.
 *
 * Run with:  node --experimental-strip-types --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { createServer } from 'node:http';

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'freshsaas-cron';
const REPO = 'farmadvisorar-ux/chatbot';

/** Stands in for GitHub's JWKS endpoint so tokens can be forged under a key we control. */
async function startFakeGitHub() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
    const server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    return { server, privateKey, url };
}

const mint = (privateKey, claims, { issuer = ISSUER, audience = AUDIENCE } = {}) =>
    new SignJWT({ ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime('5m')
        .sign(privateKey);

const gh = await startFakeGitHub();
process.env.GITHUB_OIDC_JWKS_URL = `${gh.url}/.well-known/jwks`;
process.env.GITHUB_OIDC_REPOSITORY = REPO;
process.env.CRON_SECRET = 'the-real-secret';

const { authorizeCronRequest, verifyGitHubOidc } = await import('../api/_lib/github-oidc.ts');

test('accepts the shared secret', async () => {
    const r = await authorizeCronRequest('Bearer the-real-secret');
    assert.equal(r.ok, true);
    assert.equal(r.via, 'secret');
});

test('rejects a wrong shared secret', async () => {
    const r = await authorizeCronRequest('Bearer nope');
    assert.equal(r.ok, false);
});

test('rejects missing credentials', async () => {
    assert.equal((await authorizeCronRequest(undefined)).ok, false);
    assert.equal((await authorizeCronRequest('')).ok, false);
    assert.equal((await authorizeCronRequest('Bearer ')).ok, false);
});

test('accepts a valid OIDC token from this repository', async () => {
    const token = await mint(gh.privateKey, { repository: REPO, ref: 'refs/heads/main', workflow: 'ingest' });
    const r = await verifyGitHubOidc(token);
    assert.equal(r.ok, true, `expected ok, got: ${r.reason}`);
    assert.equal(r.repository, REPO);

    const a = await authorizeCronRequest(`Bearer ${token}`);
    assert.equal(a.ok, true);
    assert.match(a.via, /github-oidc/);
});

test('rejects a token minted for a different repository', async () => {
    const token = await mint(gh.privateKey, { repository: 'attacker/evil-repo' });
    const r = await verifyGitHubOidc(token);
    assert.equal(r.ok, false);
    assert.match(r.reason, /attacker\/evil-repo/);
});

test('rejects a token with no repository claim', async () => {
    const token = await mint(gh.privateKey, {});
    assert.equal((await verifyGitHubOidc(token)).ok, false);
});

test('rejects a token minted for a different audience', async () => {
    const token = await mint(gh.privateKey, { repository: REPO }, { audience: 'some-other-service' });
    assert.equal((await verifyGitHubOidc(token)).ok, false);
});

test('rejects a token from a different issuer', async () => {
    const token = await mint(gh.privateKey, { repository: REPO }, { issuer: 'https://evil.example.com' });
    assert.equal((await verifyGitHubOidc(token)).ok, false);
});

test('rejects a token signed by an unknown key', async () => {
    const { privateKey: otherKey } = await generateKeyPair('RS256');
    const token = await mint(otherKey, { repository: REPO });
    assert.equal((await verifyGitHubOidc(token)).ok, false);
});

test('rejects an expired token', async () => {
    const token = await new SignJWT({ repository: REPO })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(ISSUER).setAudience(AUDIENCE)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 600)
        .sign(gh.privateKey);
    assert.equal((await verifyGitHubOidc(token)).ok, false);
});

test('rejects an unsigned "alg: none" token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
        iss: ISSUER, aud: AUDIENCE, repository: REPO, exp: Math.floor(Date.now() / 1000) + 600,
    })).toString('base64url');
    assert.equal((await verifyGitHubOidc(`${header}.${body}.`)).ok, false);
});

test.after(() => gh.server.close());
