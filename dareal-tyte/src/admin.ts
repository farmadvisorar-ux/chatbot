import { isConfigured, loadClerk, isSignedIn, getAuthToken, openSignIn, openSignUp, signOut, onAuthChange } from './auth';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;

const states = {
    loading: $('#state-loading'),
    signedOut: $('#state-signed-out'),
    notConfigured: $('#state-not-configured'),
    paywall: $('#state-paywall'),
    console: $('#state-console'),
};

function showState(name: keyof typeof states): void {
    for (const [key, el] of Object.entries(states)) {
        el.hidden = key !== name;
    }
}

type AccountStatus = { email: string; paid: boolean; accessExpiresAt: number | null };

async function fetchAccountStatus(): Promise<AccountStatus | null> {
    const token = await getAuthToken();
    if (!token) return null;
    const response = await fetch('/api/account-status', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    return response.json();
}

let listenerAttached = false;

async function refresh(): Promise<void> {
    if (!isConfigured()) {
        showState('notConfigured');
        return;
    }

    await loadClerk();
    if (!listenerAttached) {
        listenerAttached = true;
        onAuthChange(() => { refresh(); });
    }
    if (!isSignedIn()) {
        showState('signedOut');
        return;
    }

    const status = await fetchAccountStatus();
    if (!status) {
        showState('signedOut');
        return;
    }

    $('#accountEmail').textContent = status.email;
    $('#accountEmailConsole').textContent = status.email;

    if (!status.paid) {
        showState('paywall');
        return;
    }

    if (status.accessExpiresAt) {
        const date = new Date(status.accessExpiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        $('#accessNote').textContent = `Recover a snapshot, preview it, or launch it live to Vercel. Access expires ${date}.`;
    }
    showState('console');
}

$('#signInBtn').addEventListener('click', () => openSignIn());
$('#signUpBtn').addEventListener('click', () => openSignUp());
$('#signOutBtn').addEventListener('click', async () => { await signOut(); refresh(); });
$('#signOutBtn2').addEventListener('click', async () => { await signOut(); refresh(); });

$('#buyBtn').addEventListener('click', async () => {
    const button = $<HTMLButtonElement>('#buyBtn');
    const statusEl = $('#buyStatus');
    button.disabled = true;
    statusEl.textContent = '';
    statusEl.className = 'status';
    try {
        const token = await getAuthToken();
        const response = await fetch('/api/checkout', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
        window.location.assign(data.url);
    } catch (err) {
        statusEl.textContent = err instanceof Error ? err.message : 'Could not start checkout.';
        statusEl.className = 'status error';
        button.disabled = false;
    }
});

// Recovery console
const domainInput = $<HTMLInputElement>('#domain');
const timestampInput = $<HTMLInputElement>('#timestamp');
const recoverBtn = $<HTMLButtonElement>('#recoverBtn');
const launchBtn = $<HTMLButtonElement>('#launchBtn');
const statusEl = $('#status');
const preview = $<HTMLIFrameElement>('#preview');

function setStatus(message: string, kind?: 'ok' | 'error'): void {
    statusEl.textContent = message;
    statusEl.className = `status ${kind ?? ''}`.trim();
}

function setBusy(busy: boolean): void {
    recoverBtn.disabled = busy;
    launchBtn.disabled = busy;
}

async function callApi<T>(path: string, body: unknown): Promise<T> {
    const token = await getAuthToken();
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
    return data;
}

recoverBtn.addEventListener('click', async () => {
    preview.hidden = true;
    setStatus('Fetching and sanitizing snapshot…');
    setBusy(true);
    try {
        const data = await callApi<{ domain: string; timestamp: string; strippedLinks: number; rewrittenAssets: number; data: string }>(
            '/api/recover',
            { domain: domainInput.value.trim(), timestamp: timestampInput.value.trim() || undefined },
        );
        // Rendered in a sandboxed iframe (no allow-same-origin) so any script
        // in the recovered page can't reach this admin page's storage or DOM.
        preview.srcdoc = data.data;
        preview.hidden = false;
        setStatus(
            `Recovered ${data.domain} @ ${data.timestamp} — ${data.rewrittenAssets} asset URL(s) rewritten, ${data.strippedLinks} link(s) neutralized.`,
            'ok',
        );
    } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err), 'error');
    } finally {
        setBusy(false);
    }
});

launchBtn.addEventListener('click', async () => {
    setStatus('Fetching, sanitizing, and deploying to Vercel…');
    setBusy(true);
    try {
        const data = await callApi<{ preview_url: string; projectId: string }>(
            '/api/launch',
            { domain: domainInput.value.trim(), timestamp: timestampInput.value.trim() || undefined },
        );
        setStatus(`Deployed! ${data.preview_url}\nproject: ${data.projectId}`, 'ok');
    } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err), 'error');
    } finally {
        setBusy(false);
    }
});

refresh();
