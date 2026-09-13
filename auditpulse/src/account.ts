import './styles.css';
import { initAuth, resolveSession, requireSignIn, currentUserEmail } from './auth.js';
import { escapeHtml } from './escape-html.js';
import { icons } from './icons.js';
import { apiFetch, ApiError } from './api-client.js';

initAuth();

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signedOutSection = el<HTMLElement>('signed-out');
const loadingSection = el<HTMLElement>('loading');
const signedInSection = el<HTMLElement>('signed-in');
const planCard = el<HTMLElement>('plan-card');
const statusEl = el<HTMLElement>('status');

interface AccountTier {
    slug: string;
    name: string;
    apiAccess?: boolean;
}

interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
}

let tier: AccountTier = { slug: 'free', name: 'Free' };

const INCLUDED = [
    'Up to 10 websites, with unlimited on-demand audits',
    'The full 18-check deep audit, crawled across your site',
    'Automatic re-audit every week per verified site',
    'Embeddable trust badge and public verification page',
    'Certificate-style PDF report emailed after every audit',
    'One-click "Fix with PR" on a connected GitHub repo',
];

function note(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.className = `status ${isError ? 'error' : 'ok'}`;
}

const formatDate = (value: string | null): string =>
    value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Never';

function renderPlan(): void {
    const email = currentUserEmail();
    const isFree = tier.slug === 'free';
    planCard.innerHTML = `
        <div class="badge-pill badge-verified">${icons.check}${escapeHtml(tier.name)} plan — active</div>
        <h2 style="font-size:var(--t-xl);margin:14px 0 6px">${isFree ? 'Everything is included, at no cost.' : `You're on ${escapeHtml(tier.name)}.`}</h2>
        <p class="muted">${isFree
            ? `AuditPulse is free to use. There's no billing to manage, no card on file, and no usage cap${email ? ` on <strong>${escapeHtml(email)}</strong>` : ''}.`
            : `Your ${escapeHtml(tier.name)} features are active${email ? ` on <strong>${escapeHtml(email)}</strong>` : ''}.`}</p>
        <ul class="check-list" style="margin-top:18px">
            ${INCLUDED.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
        <p class="legal-note" style="margin-top:20px">Manage your email address, password, and connected sign-in methods from the account menu in the top-right.</p>`;
}

/** The API keys panel, rendered only for tiers that include the REST API. */
function renderKeys(keys: ApiKey[]): void {
    const live = keys.filter(k => !k.revoked_at);
    const rows = live.length ? live.map(key => `
        <tr>
            <td>${escapeHtml(key.name)}</td>
            <td><code>${escapeHtml(key.prefix)}…</code></td>
            <td class="muted">${escapeHtml(formatDate(key.created_at))}</td>
            <td class="muted">${escapeHtml(formatDate(key.last_used_at))}</td>
            <td><button type="button" class="text-button key-revoke" data-key-id="${escapeHtml(key.id)}" data-key-name="${escapeHtml(key.name)}">Revoke</button></td>
        </tr>`).join('') : '<tr><td colspan="5" class="muted">No keys yet.</td></tr>';

    el<HTMLElement>('keys-card').innerHTML = `
        <h2 style="font-size:var(--t-lg);margin:0 0 4px">API keys</h2>
        <p class="muted" style="font-size:13px;margin-top:0">Call the REST API, or run the
            <a href="https://github.com/farmadvisorar-ux/chatbot/tree/main/auditpulse/examples/github-action">GitHub Action</a>
            that fails your build when a deploy introduces a new Critical or High.</p>
        <div style="overflow-x:auto">
            <table class="key-table">
                <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div class="field" style="max-width:320px;margin-top:16px">
            <label for="key-name">Name a new key</label>
            <input id="key-name" type="text" placeholder="CI — production" autocomplete="off" maxlength="80">
        </div>
        <button type="button" id="key-create" class="mini-cta">Create key</button>
        <div id="key-reveal" hidden></div>`;

    el<HTMLButtonElement>('key-create').addEventListener('click', createKey);
    for (const button of document.querySelectorAll<HTMLButtonElement>('.key-revoke')) {
        button.addEventListener('click', () => revokeKey(button.dataset.keyId!, button.dataset.keyName!));
    }
}

async function loadKeys(): Promise<void> {
    try {
        const { keys } = await apiFetch<{ keys: ApiKey[] }>('/keys');
        renderKeys(keys);
    } catch (err) {
        // A 402 means the plan doesn't include the API — that isn't an error
        // worth shouting about on a page opened for other reasons.
        if (err instanceof ApiError && err.status === 402) return;
        note(err instanceof Error ? err.message : 'Could not load API keys.', true);
    }
}

async function createKey(): Promise<void> {
    const button = el<HTMLButtonElement>('key-create');
    const name = el<HTMLInputElement>('key-name').value.trim();
    button.disabled = true;
    try {
        const { key } = await apiFetch<{ key: ApiKey & { token: string } }>('/keys', {
            method: 'POST',
            body: { name },
        });
        const { keys } = await apiFetch<{ keys: ApiKey[] }>('/keys');
        renderKeys(keys);

        // Written after the re-render, not before: renderKeys replaces the
        // whole card, and the plaintext key exists nowhere else to recover from.
        const reveal = el<HTMLElement>('key-reveal');
        reveal.hidden = false;
        reveal.className = 'card';
        reveal.style.cssText = 'background:var(--surface-2);margin-top:16px';
        reveal.innerHTML = `
            <strong>Copy this key now — it is not shown again.</strong>
            <pre class="key-reveal-token">${escapeHtml(key.token)}</pre>
            <button type="button" id="key-copy" class="mini-cta">Copy</button>
            <span id="key-copy-status" class="status" style="display:inline-block;margin-left:10px"></span>`;
        el<HTMLButtonElement>('key-copy').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(key.token);
                el<HTMLElement>('key-copy-status').textContent = 'Copied.';
            } catch {
                el<HTMLElement>('key-copy-status').textContent = 'Select the key and copy it manually.';
            }
        });
    } catch (err) {
        note(err instanceof Error ? err.message : 'Could not create the key.', true);
        button.disabled = false;
    }
}

async function revokeKey(id: string, name: string): Promise<void> {
    // Revocation is immediate and irreversible, and the thing it breaks — a
    // CI pipeline — fails somewhere the person clicking may not be watching.
    if (!window.confirm(`Revoke "${name}"? Anything using this key stops working immediately.`)) return;
    try {
        await apiFetch(`/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const { keys } = await apiFetch<{ keys: ApiKey[] }>('/keys');
        renderKeys(keys);
        note(`Revoked "${name}".`);
    } catch (err) {
        note(err instanceof Error ? err.message : 'Could not revoke the key.', true);
    }
}

(async () => {
    const signedIn = await resolveSession();
    loadingSection.hidden = true;
    if (!signedIn) {
        signedOutSection.hidden = false;
        el<HTMLButtonElement>('signin').addEventListener('click', async () => {
            if (await requireSignIn()) window.location.reload();
        });
        return;
    }
    signedInSection.hidden = false;

    // The tier rides along on /targets rather than having a route of its own.
    // A failure here degrades to the free plan card, which is the honest
    // default: it never claims a plan the account might not have.
    try {
        const data = await apiFetch<{ tier?: AccountTier }>('/targets');
        if (data.tier) tier = data.tier;
    } catch {
        // Keep the default.
    }

    renderPlan();
    if (tier.apiAccess) {
        el<HTMLElement>('keys-card').hidden = false;
        await loadKeys();
    }
})();
