import { createHmac } from 'node:crypto';
import { safeFetch, DisallowedTargetError } from '../../lib/scanner/net.js';

export type WebhookKind = 'slack' | 'discord' | 'generic';

export interface WebhookConfig {
    url: string;
    kind: WebhookKind;
    /** Signing secret for `generic` webhooks. Slack and Discord authenticate by the secret already embedded in their URL. */
    secret: string | null;
}

/** The alert being delivered, in a shape that is independent of any one channel's formatting. */
export interface AlertPayload {
    /** Machine-readable alert type — the same label runPostScanAlerts returns. */
    event: 'new-issues' | 'cert-expiry' | 'changes' | 'new-subdomains';
    site: string;
    hostname: string;
    heading: string;
    intro: string;
    items: string[];
    reportUrl: string;
}

/** Discord rejects a message over 2000 characters outright; Slack truncates a text block over 3000. Staying under both keeps one formatter honest. */
const MAX_BODY_CHARS = 1900;

/** Bullets past this are summarised as a count. A 200-finding alert helps nobody and would blow the length cap on its own. */
const MAX_ITEMS = 12;

/**
 * Slack and Discord both publish their webhook endpoints on fixed hosts, so
 * the URL itself says which format to send. Anything else is treated as a
 * customer's own endpoint and gets signed JSON.
 */
export function detectWebhookKind(rawUrl: string): WebhookKind {
    let host: string;
    try {
        host = new URL(rawUrl).hostname.toLowerCase();
    } catch {
        return 'generic';
    }
    if (host === 'hooks.slack.com') return 'slack';
    if (host === 'discord.com' || host === 'discordapp.com' || host === 'canary.discord.com' || host === 'ptb.discord.com') {
        return 'discord';
    }
    return 'generic';
}

/**
 * Rejects anything that isn't an https URL we could plausibly POST to. The
 * SSRF guard in safeFetch is the real defence (it re-checks every redirect
 * hop against the resolved address), but failing here gives the customer a
 * clear error at configuration time instead of a silent non-delivery later.
 */
export function validateWebhookUrl(rawUrl: string): { ok: true; url: string } | { ok: false; reason: string } {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { ok: false, reason: 'That is not a valid URL.' };
    }
    if (parsed.protocol !== 'https:') {
        return { ok: false, reason: 'Webhook URLs must use https:// — an alert can name an unpatched vulnerability, so it is never sent in the clear.' };
    }
    if (!parsed.hostname.includes('.')) {
        return { ok: false, reason: 'That host does not look like a public address.' };
    }
    return { ok: true, url: parsed.toString() };
}

function truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Bullets, capped, with an honest "+N more" rather than a silently short list. */
function renderItems(items: string[], bullet: string): string {
    const shown = items.slice(0, MAX_ITEMS).map(item => `${bullet} ${item}`);
    if (items.length > MAX_ITEMS) shown.push(`${bullet} …and ${items.length - MAX_ITEMS} more`);
    return shown.join('\n');
}

/**
 * Slack renders `mrkdwn`, which is not Markdown: bold is *single* asterisks and
 * links are `<url|label>`. Sending real Markdown here shows the raw syntax.
 */
function slackBody(payload: AlertPayload): unknown {
    const text = truncate(
        [`*${payload.heading} — ${payload.site}*`, payload.intro, renderItems(payload.items, '•'), `<${payload.reportUrl}|View the full report>`]
            .filter(Boolean)
            .join('\n\n'),
        MAX_BODY_CHARS,
    );
    // `text` is also the notification/fallback string, so it is sent alongside
    // the block rather than instead of it — a blocks-only message shows as
    // "This content can't be displayed" in Slack's mobile push.
    return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

/** Discord takes real Markdown, and suppresses link previews with <angle brackets>. */
function discordBody(payload: AlertPayload): unknown {
    const content = truncate(
        [`**${payload.heading} — ${payload.site}**`, payload.intro, renderItems(payload.items, '•'), `<${payload.reportUrl}>`]
            .filter(Boolean)
            .join('\n\n'),
        MAX_BODY_CHARS,
    );
    return { content };
}

function genericBody(payload: AlertPayload): unknown {
    return {
        event: payload.event,
        site: payload.site,
        hostname: payload.hostname,
        heading: payload.heading,
        summary: payload.intro,
        items: payload.items,
        report_url: payload.reportUrl,
        sent_at: new Date().toISOString(),
    };
}

/**
 * The signature a `generic` receiver verifies: HMAC-SHA256 over the exact
 * bytes of the request body, keyed with the secret shown once when the
 * webhook was saved. Same construction as Stripe's and GitHub's, so a
 * customer can reuse a verifier they already have.
 */
export function signPayload(body: string, secret: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export interface DeliveryResult {
    ok: boolean;
    status?: number;
    error?: string;
}

/**
 * Posts one alert to one webhook. Never throws: a broken or hostile webhook
 * endpoint must not be able to fail the scan that produced the alert, so
 * every outcome comes back as a result the caller can log.
 *
 * Redirects are not followed (`maxRedirects: 0`). A webhook receiver has no
 * legitimate reason to redirect a POST, and re-posting a signed body to a
 * location the customer did not configure is exactly the move an attacker who
 * got a redirect onto the URL would want.
 */
export async function deliverWebhook(config: WebhookConfig, payload: AlertPayload): Promise<DeliveryResult> {
    const body = JSON.stringify(
        config.kind === 'slack' ? slackBody(payload)
            : config.kind === 'discord' ? discordBody(payload)
                : genericBody(payload),
    );

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.kind === 'generic') {
        headers['X-AuditPulse-Event'] = payload.event;
        if (config.secret) headers['X-AuditPulse-Signature'] = signPayload(body, config.secret);
    }

    try {
        const response = await safeFetch(config.url, {
            method: 'POST',
            headers,
            body,
            timeoutMs: 5000,
            maxRedirects: 0,
            maxBodyBytes: 16_000,
        });
        if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status };
        return { ok: false, status: response.status, error: `Webhook responded ${response.status}` };
    } catch (err) {
        const reason = err instanceof DisallowedTargetError
            ? err.message
            : err instanceof Error ? err.message : 'Webhook delivery failed';
        return { ok: false, error: reason };
    }
}
