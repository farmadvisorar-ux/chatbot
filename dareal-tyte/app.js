const apiKeyInput = document.getElementById('apiKey');
const domainInput = document.getElementById('domain');
const timestampInput = document.getElementById('timestamp');
const recoverBtn = document.getElementById('recoverBtn');
const launchBtn = document.getElementById('launchBtn');
const statusEl = document.getElementById('status');
const preview = document.getElementById('preview');

const STORAGE_KEY = 'dareal_admin_key';
apiKeyInput.value = localStorage.getItem(STORAGE_KEY) ?? '';
apiKeyInput.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, apiKeyInput.value);
});

function setStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = `status ${kind ?? ''}`.trim();
}

function setBusy(busy) {
    recoverBtn.disabled = busy;
    launchBtn.disabled = busy;
}

async function callApi(path, body) {
    const response = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKeyInput.value,
        },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `Request failed (HTTP ${response.status})`);
    }
    return data;
}

recoverBtn.addEventListener('click', async () => {
    preview.hidden = true;
    setStatus('Fetching and sanitizing snapshot…');
    setBusy(true);
    try {
        const data = await callApi('/api/recover', {
            domain: domainInput.value.trim(),
            timestamp: timestampInput.value.trim() || undefined,
        });
        // Rendered in a sandboxed iframe (no allow-same-origin) so any script
        // in the recovered page can't reach this admin page's storage or DOM.
        preview.srcdoc = data.data;
        preview.hidden = false;
        setStatus(
            `Recovered ${data.domain} @ ${data.timestamp} — ${data.rewrittenAssets} asset URL(s) rewritten, ${data.strippedLinks} link(s) neutralized.`,
            'ok',
        );
    } catch (err) {
        setStatus(err.message, 'error');
    } finally {
        setBusy(false);
    }
});

launchBtn.addEventListener('click', async () => {
    setStatus('Fetching, sanitizing, and deploying to Vercel…');
    setBusy(true);
    try {
        const data = await callApi('/api/launch', {
            domain: domainInput.value.trim(),
            timestamp: timestampInput.value.trim() || undefined,
        });
        setStatus(`Deployed! ${data.preview_url}\nproject: ${data.projectId}`, 'ok');
    } catch (err) {
        setStatus(err.message, 'error');
    } finally {
        setBusy(false);
    }
});
