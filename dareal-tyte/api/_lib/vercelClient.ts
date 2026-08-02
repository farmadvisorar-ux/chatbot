import { slugifyProjectName } from './domain.js';

export class VercelApiError extends Error {}

function requireToken(): string {
    const token = process.env.VERCEL_TOKEN;
    if (!token) throw new VercelApiError('VERCEL_TOKEN is not configured on this deployment.');
    return token;
}

function apiUrl(path: string): string {
    const teamId = process.env.VERCEL_TEAM_ID;
    const url = new URL(`https://api.vercel.com${path}`);
    if (teamId) url.searchParams.set('teamId', teamId);
    return url.toString();
}

async function vercelRequest<T>(path: string, init: RequestInit): Promise<T> {
    const token = requireToken();
    const response = await fetch(apiUrl(path), {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...init.headers,
        },
    });

    // Vercel's error payload shape isn't worth modeling in full; this is an
    // external API response boundary, so `any` here is a deliberate escape
    // hatch rather than a shortcut around our own types.
    const body: any = await response.json().catch(() => null);
    if (!response.ok) {
        const message = (body && (body.error?.message ?? body.error)) || `HTTP ${response.status}`;
        throw new VercelApiError(`Vercel API error: ${message}`);
    }
    return body as T;
}

export interface DeployResult {
    projectId: string;
    deploymentId: string;
    liveUrl: string;
    public: boolean;
}

/**
 * New projects on this Vercel team inherit an org-wide default
 * (ssoProtection: "all_except_custom_domains") that walls every
 * *.vercel.app URL behind a Vercel login — confirmed by reproducing it
 * directly against the API. That defeats the entire point of a recovered
 * site's preview link, so it's disabled immediately after the project is
 * created. Best-effort: if this call fails, the deployment itself still
 * succeeded, so that's reported via `public: false` rather than failing
 * the whole launch over a settings tweak.
 */
async function disableDeploymentProtection(projectId: string): Promise<boolean> {
    try {
        await vercelRequest(`/v9/projects/${encodeURIComponent(projectId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ ssoProtection: null }),
        });
        return true;
    } catch (err) {
        console.error('disableDeploymentProtection failed', err);
        return false;
    }
}

/** Deploys a single static HTML file as a new production Vercel deployment. */
export async function deployToVercel(html: string, domainName: string): Promise<DeployResult> {
    const projectName = slugifyProjectName(domainName);

    const data = await vercelRequest<{ id: string; url: string; projectId?: string }>('/v13/deployments', {
        method: 'POST',
        body: JSON.stringify({
            name: projectName,
            projectSettings: { framework: null },
            files: [{ file: 'index.html', data: html, encoding: 'utf-8' }],
            target: 'production',
        }),
    });

    const projectId = data.projectId ?? projectName;
    const isPublic = await disableDeploymentProtection(projectId);

    return {
        projectId,
        deploymentId: data.id,
        liveUrl: `https://${data.url}`,
        public: isPublic,
    };
}

export interface DomainMappingResult {
    domain: string;
    verified: boolean;
    verification: unknown;
}

export async function mapCustomDomain(projectId: string, customDomain: string): Promise<DomainMappingResult> {
    const data = await vercelRequest<{ name: string; verified: boolean; verification?: unknown }>(
        `/v9/projects/${encodeURIComponent(projectId)}/domains`,
        { method: 'POST', body: JSON.stringify({ name: customDomain }) },
    );
    return { domain: data.name, verified: data.verified, verification: data.verification ?? null };
}

export interface DomainVerificationResult {
    domain: string;
    verified: boolean;
    verification: unknown;
}

export async function verifyDomainStatus(projectId: string, customDomain: string): Promise<DomainVerificationResult> {
    const data = await vercelRequest<{ name: string; verified: boolean; verification?: unknown }>(
        `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(customDomain)}`,
        { method: 'GET' },
    );
    return { domain: data.name, verified: data.verified, verification: data.verification ?? null };
}
