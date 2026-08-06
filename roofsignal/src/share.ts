import './share.css';
import { escapeHtml } from './escape-html';

type SharedSummary = {
    roofCondition: string; stormAnalysis: string; insuranceNotes: string; recommendation: string;
    notes: string; shareExpiresAt: string; createdAt: string;
    homeownerName: string; address: string; neighborhood: string;
};
type SharedPhoto = { url: string; tag: string };

function readToken(): string | null {
    // Vercel rewrites /s/:token -> /share.html without changing the visible
    // URL, so the token lives in the path the browser actually shows. The
    // query-string form is kept only so `share.html?token=...` works too,
    // e.g. while testing locally with `vite dev` (which never sees the
    // /s/:token rewrite at all).
    const fromQuery = new URLSearchParams(location.search).get('token');
    if (fromQuery) return fromQuery;
    const match = /\/s\/([^/?#]+)/.exec(location.pathname);
    return match ? match[1]! : null;
}

const root = document.getElementById('root')!;

function render(summary: SharedSummary, photos: SharedPhoto[]): void {
    const expires = new Date(summary.shareExpiresAt).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
    });
    root.innerHTML = `
      <header class="share-header">
        <div class="brand">🏠 RoofSignal</div>
        <div class="signature">Roof Inspection Summary — John with Cypress</div>
      </header>
      <main class="share-card">
        <h1>${escapeHtml(summary.homeownerName)}</h1>
        <p class="addr">${escapeHtml(summary.address)} · ${escapeHtml(summary.neighborhood)}</p>

        <section>
            <h2>Roof condition</h2>
            <p>${escapeHtml(summary.roofCondition)}</p>
        </section>
        <section>
            <h2>Storm impact analysis</h2>
            <p>${escapeHtml(summary.stormAnalysis)}</p>
        </section>
        <section>
            <h2>Insurance notes</h2>
            <p>${escapeHtml(summary.insuranceNotes)}</p>
        </section>
        <section>
            <h2>Recommendation</h2>
            <p>${escapeHtml(summary.recommendation)}</p>
        </section>
        ${summary.notes ? `<section><h2>Additional notes</h2><p>${escapeHtml(summary.notes)}</p></section>` : ''}

        ${photos.length ? `<section>
            <h2>Photos</h2>
            <div class="photo-grid">
                ${photos.map(p => `<img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.tag)} photo" loading="lazy" />`).join('')}
            </div>
        </section>` : ''}

        <footer>
            <p>— John with Cypress</p>
            <p class="expiry">This link is available through ${expires}.</p>
        </footer>
      </main>
    `;
}

async function main(): Promise<void> {
    const token = readToken();
    if (!token) {
        root.innerHTML = '<p class="error">Missing summary link.</p>';
        return;
    }
    try {
        const response = await fetch(`/api/summary/${encodeURIComponent(token)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'This link has expired or does not exist.');
        render(payload.summary, payload.photos);
    } catch (err) {
        root.innerHTML = `<p class="error">${escapeHtml(err instanceof Error ? err.message : 'Could not load this summary.')}</p>`;
    }
}

main();
