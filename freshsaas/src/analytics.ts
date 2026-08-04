/**
 * First-party, cookie-free analytics.
 *
 * The session id lives in sessionStorage, so it disappears when the tab closes
 * and never follows anyone between visits. No IP address is sent, and the
 * server stores none — which is what keeps the site out of cookie-consent
 * territory while still answering what visitors actually do.
 */

type EventType = 'pageview' | 'listing_click' | 'search' | 'outbound' | 'signup_open' | 'submit_open' | 'marketplace_view' | 'ad_click';

const SESSION_KEY = 'freshsaas_sid';

function sessionId(): string {
    try {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = Math.random().toString(36).slice(2) + Date.now().toString(36);
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        return 'no-storage';
    }
}

export function track(type: EventType, detail: { label?: string; entryId?: string; path?: string } = {}): void {
    const { path, ...rest } = detail;
    const payload = JSON.stringify({
        type,
        // Insights articles are hash-routed, so the caller can name the path
        // it wants recorded rather than every article reporting /insights.html.
        path: path || location.pathname,
        referrer: document.referrer || null,
        sessionId: sessionId(),
        ...rest,
    });

    try {
        // sendBeacon survives the page being unloaded, which matters for the
        // outbound clicks that are the most interesting events here.
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/directory', new Blob([payload], { type: 'application/json' }));
            return;
        }
    } catch {
        /* Fall through to fetch. */
    }
    // Analytics must never break the page or block navigation.
    fetch('/api/directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true })
        .catch(() => undefined);
}

/** Debounced so a search box reports the finished query, not every keystroke. */
export function trackSearch(getValue: () => string): () => void {
    let timer = 0;
    return () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
            const value = getValue().trim();
            if (value.length >= 3) track('search', { label: value.slice(0, 80) });
        }, 900);
    };
}
