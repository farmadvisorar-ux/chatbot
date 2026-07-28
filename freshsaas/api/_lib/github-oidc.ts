import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies a GitHub Actions OIDC token.
 *
 * The scheduled jobs live in GitHub Actions because Vercel's Hobby plan caps
 * cron at once a day. Authenticating them with a shared secret means someone
 * has to copy CRON_SECRET into the repository's secrets by hand, and until
 * that happens every scheduled run dies at the guard — which is exactly what
 * had been happening.
 *
 * A workflow granted `id-token: write` can instead ask GitHub to mint a
 * short-lived token signed by GitHub, with no stored secret anywhere. We
 * verify the signature against GitHub's published keys and then check the
 * token actually came from this repository. A token minted by any other
 * repository is signed by the same issuer, so the `repository` claim is the
 * real access boundary and must never be skipped.
 */

const ISSUER = 'https://token.actions.githubusercontent.com';

// Audience is chosen by us and requested by the workflow. It stops a token
// minted for some other service from being replayed against this endpoint.
const AUDIENCE = 'freshsaas-cron';

const DEFAULT_REPOSITORY = 'farmadvisorar-ux/chatbot';

// Cached across invocations on a warm function so the keys aren't refetched
// on every request; jose handles rotation and re-fetch internally.
//
// The URL is only overridable so the tests can point at a local key server.
// It is read once at module load, not per request, so it cannot be swapped at
// runtime, and in production nothing sets it.
const jwks = createRemoteJWKSet(new URL(process.env.GITHUB_OIDC_JWKS_URL || `${ISSUER}/.well-known/jwks`));

export type OidcResult =
    | { ok: true; repository: string; ref: string; workflow: string }
    | { ok: false; reason: string };

export async function verifyGitHubOidc(token: string): Promise<OidcResult> {
    const expected = process.env.GITHUB_OIDC_REPOSITORY || DEFAULT_REPOSITORY;
    try {
        const { payload } = await jwtVerify(token, jwks, {
            issuer: ISSUER,
            audience: AUDIENCE,
            // GitHub tokens are short-lived; allow a little clock drift only.
            clockTolerance: 30,
        });

        const repository = typeof payload.repository === 'string' ? payload.repository : '';
        if (repository.toLowerCase() !== expected.toLowerCase()) {
            return { ok: false, reason: `token is for repository "${repository}"` };
        }

        return {
            ok: true,
            repository,
            ref: typeof payload.ref === 'string' ? payload.ref : '',
            workflow: typeof payload.workflow === 'string' ? payload.workflow : '',
        };
    } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : 'invalid token' };
    }
}

/**
 * Accepts either the shared secret or a GitHub Actions OIDC token.
 *
 * The secret path is kept so an operator can still call the endpoint by hand
 * (and so nothing breaks if GitHub's OIDC service is unavailable).
 */
export async function authorizeCronRequest(authorization: string | undefined): Promise<{ ok: boolean; via?: string; reason?: string }> {
    const provided = authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!provided) return { ok: false, reason: 'missing credentials' };

    const secret = process.env.CRON_SECRET;
    if (secret && provided === secret) return { ok: true, via: 'secret' };

    // A JWT has three dot-separated segments; anything else is a bad secret,
    // and reporting it as such avoids a pointless network call to GitHub.
    if (provided.split('.').length !== 3) return { ok: false, reason: 'invalid secret' };

    const result = await verifyGitHubOidc(provided);
    if (result.ok) return { ok: true, via: `github-oidc (${result.repository})` };
    return { ok: false, reason: result.reason };
}
