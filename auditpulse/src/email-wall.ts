const DELAY_MS = 10_000;
/** Mirrors the server cookie name, but this one is readable by JS purely so the wall can suppress itself before any network call. */
const LOCAL_FLAG = 'ap_email_captured';

function alreadyCaptured(): boolean {
    try {
        return localStorage.getItem(LOCAL_FLAG) === '1';
    } catch {
        return false;
    }
}

function markCaptured(): void {
    try {
        localStorage.setItem(LOCAL_FLAG, '1');
    } catch {
        // Private-mode browsers block storage; the server cookie still covers us.
    }
}

/**
 * Shows the email wall 10 seconds after load, unless this visitor has
 * already given us an email. Suppression is layered: a local flag avoids
 * a network round-trip on repeat visits, and the server additionally
 * checks its own cookie plus the client IP, so clearing site data doesn't
 * bring the prompt back.
 *
 * Dismissing only hides it for this page view — submitting is what
 * suppresses it for good.
 */
export function initEmailWall(): void {
    const overlay = document.querySelector<HTMLElement>('#email-wall');
    if (!overlay) return;

    const form = overlay.querySelector<HTMLFormElement>('#email-wall-form')!;
    const input = overlay.querySelector<HTMLInputElement>('#email-wall-input')!;
    const submit = overlay.querySelector<HTMLButtonElement>('#email-wall-submit')!;
    const statusEl = overlay.querySelector<HTMLElement>('#email-wall-status')!;
    const dismiss = overlay.querySelector<HTMLButtonElement>('#email-wall-dismiss')!;

    let lastFocused: Element | null = null;

    const close = (): void => {
        overlay.hidden = true;
        document.body.style.overflow = '';
        if (lastFocused instanceof HTMLElement) lastFocused.focus();
    };

    const open = (): void => {
        lastFocused = document.activeElement;
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        input.focus();
    };

    dismiss.addEventListener('click', close);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) close();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !overlay.hidden) close();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const email = input.value.trim();
        if (!email) return;

        submit.disabled = true;
        submit.textContent = 'Saving…';
        statusEl.textContent = '';
        statusEl.className = 'status';

        try {
            const res = await fetch('/api/email-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save your email.');

            markCaptured();
            statusEl.textContent = "You're all set — thanks!";
            statusEl.className = 'status ok';
            setTimeout(close, 900);
        } catch (err) {
            statusEl.textContent = err instanceof Error ? err.message : 'Something went wrong. Try again.';
            statusEl.className = 'status error';
            submit.disabled = false;
            submit.textContent = 'Send me the full audit';
        }
    });

    if (alreadyCaptured()) return;

    window.setTimeout(async () => {
        // Re-check server-side right before showing: the visitor may be known
        // by cookie or IP even on a browser with no local flag.
        try {
            const res = await fetch('/api/email-capture');
            const data = await res.json().catch(() => ({}));
            if (data.known) {
                markCaptured();
                return;
            }
        } catch {
            // Offline or API down — showing the prompt is the safe default.
        }
        if (overlay.hidden) open();
    }, DELAY_MS);
}
