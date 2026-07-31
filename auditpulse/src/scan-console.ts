interface ConsoleLine { text: string; kind: 'ok' | 'warn' | 'bad' | 'dim' }

/**
 * Illustrative only — not a real scan. Mirrors the kind of checks AuditPulse
 * actually runs (see lib/scanner) so it stays honest about capabilities
 * without claiming to be live data.
 */
const SCRIPT: ConsoleLine[] = [
    { text: '$ auditpulse scan yoursite.com', kind: 'dim' },
    { text: 'Checking security headers…', kind: 'dim' },
    { text: 'Content-Security-Policy present', kind: 'ok' },
    { text: 'Missing Strict-Transport-Security', kind: 'bad' },
    { text: 'Checking TLS & certificate…', kind: 'dim' },
    { text: 'TLS 1.3, valid 340 more days', kind: 'ok' },
    { text: 'Scanning JS bundles for secrets…', kind: 'dim' },
    { text: 'Possible API key in main.js:412', kind: 'warn' },
    { text: 'Checking cookies & CORS…', kind: 'dim' },
    { text: 'Cookies scoped correctly', kind: 'ok' },
    { text: 'Crawling linked pages…', kind: 'dim' },
    { text: '12 pages checked', kind: 'ok' },
    { text: 'Grade B+ · 3 findings · 41s', kind: 'ok' },
];

const ICON: Record<ConsoleLine['kind'], string> = { ok: '✓', warn: '⚠', bad: '✗', dim: '›' };

function lineHtml(l: ConsoleLine): string {
    const textClass = l.kind === 'dim' ? 'dim' : 'txt';
    return `<div class="console-line ${l.kind}"><span class="icon">${ICON[l.kind]}</span><span class="${textClass}">${l.text}</span></div>`;
}

/** Mounts a looping, purely decorative "what a scan looks like" animation. No-op if the element isn't on the page. */
export function initScanConsole(): void {
    const body = document.querySelector<HTMLElement>('#console-body');
    if (!body) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        body.innerHTML = SCRIPT.map(lineHtml).join('');
        return;
    }

    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    function step(): void {
        if (i === 0) body!.innerHTML = '';
        if (i < SCRIPT.length) {
            body!.insertAdjacentHTML('beforeend', lineHtml(SCRIPT[i]));
            body!.scrollTop = body!.scrollHeight;
            i++;
            timer = setTimeout(step, i === SCRIPT.length ? 2600 : 420);
        } else {
            i = 0;
            timer = setTimeout(step, 1000);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearTimeout(timer);
        else step();
    });

    step();
}
