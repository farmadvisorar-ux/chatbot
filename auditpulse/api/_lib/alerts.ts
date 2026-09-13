import type pg from 'pg';
import type { Finding, SiteFingerprint } from '../../lib/scanner/types.js';
import type { TierLimits } from './tier.js';
import { sendAlertEmail } from './email.js';
import { siteOrigin } from './site.js';
import { deliverWebhook, type AlertPayload, type WebhookKind } from './notify.js';
import { decryptSecret } from './crypto.js';

/** Thresholds, in days, at which a certificate expiry warning goes out. Descending: the first one crossed is the one reported. */
const CERT_THRESHOLDS = [30, 14, 7, 1];

/** Informational findings are excluded from "new issue" alerts — they're inventory, not problems, and would email on every harmless change. */
const ALERTABLE = new Set(['critical', 'high', 'medium', 'low']);

export interface AlertTarget {
    id: string;
    hostname: string;
    label: string | null;
    owner_email: string;
    baseline: SiteFingerprint | null;
    cert_expires_at: string | Date | null;
    cert_expiry_notified_days: number | null;
    webhook_url?: string | null;
    webhook_kind?: WebhookKind | null;
    webhook_secret_encrypted?: string | null;
}

/**
 * Sends one alert to every channel the account has. Email and webhook are
 * independent: a dead webhook must not suppress the email, and vice versa,
 * so both are attempted and the alert counts as delivered if either lands.
 */
type Dispatch = (
    event: AlertPayload['event'],
    message: { subject: string; heading: string; intro: string; bullets: string[] },
) => Promise<boolean>;

/**
 * A finding's identity across scans.
 *
 * Titles are included because one check emits several distinct findings (the
 * headers check alone reports each missing header separately, all at the same
 * severity with no affected_url), so dropping the title would collapse them
 * into one and hide genuinely new problems. But digits are masked first:
 * several titles embed a count ("3 subdomain(s) found in public certificate
 * logs"), and without masking, the count merely ticking up would read as a
 * brand-new issue and email the owner about nothing.
 */
export function identity(f: { check_id: string; title: string; severity: string; affected_url: string | null }): string {
    return [f.check_id, f.severity, f.affected_url ?? '', f.title.replace(/\d+/g, '#')].join('|');
}

function displayName(target: AlertTarget): string {
    return target.label || target.hostname;
}

/**
 * Emails the owner about anything this scan revealed that the previous one
 * didn't, according to what their tier includes. Each alert type is guarded
 * both by the tier flag and by having a previous state to compare against —
 * the very first scan of a site establishes the baseline silently rather than
 * reporting its entire contents as "new".
 *
 * Every failure here is swallowed and returned as a label: an alert that
 * can't be sent must never fail the scan that produced it, because the scan
 * result itself is still worth keeping.
 */
export async function runPostScanAlerts(
    pool: pg.Pool,
    params: {
        target: AlertTarget;
        scanId: string;
        shareToken: string;
        findings: Finding[];
        fingerprint: SiteFingerprint;
        limits: TierLimits;
    },
): Promise<string[]> {
    const { target, scanId, shareToken, findings, fingerprint, limits } = params;
    const sent: string[] = [];
    const reportUrl = `${siteOrigin()}/api/share/${encodeURIComponent(shareToken)}`;
    const name = displayName(target);
    const dispatch = makeDispatch(pool, target, name, reportUrl, limits);

    try {
        if (limits.newIssueAlerts) {
            const newIssues = await findNewIssues(pool, target.id, scanId, findings);
            if (newIssues.length) {
                const ok = await dispatch('new-issues', {
                    subject: `${newIssues.length} new issue${newIssues.length === 1 ? '' : 's'} on ${name}`,
                    heading: 'New issues found',
                    intro: `The latest audit of ${name} turned up ${newIssues.length} issue${newIssues.length === 1 ? '' : 's'} that wasn't there last time.`,
                    bullets: newIssues.slice(0, 10).map(f => `[${f.severity.toUpperCase()}] ${f.title}`),
                });
                if (ok) sent.push('new-issues');
            }
        }

        if (limits.certExpiryAlerts && fingerprint.certExpiresAt) {
            if (await maybeWarnCertExpiry(pool, target, fingerprint.certExpiresAt, name, dispatch)) {
                sent.push('cert-expiry');
            }
        }

        const baseline = target.baseline;
        if (limits.changeAlerts && baseline) {
            const changes = describeChanges(baseline, fingerprint);
            if (changes.length) {
                const ok = await dispatch('changes', {
                    subject: `Security configuration changed on ${name}`,
                    heading: 'Something changed',
                    intro: `Since the last audit, ${name}'s security configuration changed. If you made these changes, nothing to do.`,
                    bullets: changes,
                });
                if (ok) sent.push('changes');
            }
        }

        if (limits.subdomainAlerts && baseline?.subdomains?.length) {
            const known = new Set(baseline.subdomains);
            const appeared = fingerprint.subdomains.filter(s => !known.has(s));
            if (appeared.length) {
                const ok = await dispatch('new-subdomains', {
                    subject: `${appeared.length} new subdomain${appeared.length === 1 ? '' : 's'} for ${name}`,
                    heading: 'New subdomain detected',
                    intro: `A certificate was issued for ${appeared.length} subdomain${appeared.length === 1 ? '' : 's'} of ${name} that we hadn't seen before. Worth confirming each one is meant to be public.`,
                    bullets: appeared.slice(0, 15),
                });
                if (ok) sent.push('new-subdomains');
            }
        }
    } catch (err) {
        console.error(`Post-scan alerts failed for ${target.hostname}:`, err);
    }

    // Always advance the baseline, even if an alert failed to send: leaving a
    // stale baseline in place would re-report the same change on every
    // subsequent scan until it happened to succeed.
    try {
        await pool.query(
            'UPDATE targets SET baseline = $2, baseline_at = now() WHERE id = $1',
            [target.id, JSON.stringify(fingerprint)],
        );
    } catch (err) {
        console.error(`Could not store scan baseline for ${target.hostname}:`, err);
    }

    return sent;
}

/**
 * Builds the fan-out used for every alert on one target: always email, plus
 * the webhook when the tier includes one and the site has one configured.
 *
 * Delivery outcome is recorded on the target so a webhook that has quietly
 * stopped working (a revoked Slack URL, a receiver returning 500) is visible
 * in the dashboard rather than swallowing alerts in silence. A failure here
 * never propagates: the email is the alert of record.
 */
function makeDispatch(
    pool: pg.Pool,
    target: AlertTarget,
    name: string,
    reportUrl: string,
    limits: TierLimits,
): Dispatch {
    const webhookUrl = limits.webhookAlerts ? target.webhook_url ?? null : null;

    return async (event, message) => {
        const emailed = await sendAlertEmail({
            toEmail: target.owner_email,
            subject: message.subject,
            heading: message.heading,
            intro: message.intro,
            bullets: message.bullets,
            reportUrl,
        });

        if (!webhookUrl) return emailed.ok;

        let secret: string | null = null;
        if (target.webhook_secret_encrypted) {
            try {
                secret = decryptSecret(target.webhook_secret_encrypted);
            } catch (err) {
                // An unreadable secret means an unsigned payload, which a
                // verifying receiver will reject — better to send nothing and
                // say why than to send something that silently fails auth.
                console.error(`Could not decrypt webhook secret for ${target.hostname}:`, err);
                await recordWebhookResult(pool, target.id, { ok: false, error: 'Signing secret could not be read.' });
                return emailed.ok;
            }
        }

        const payload: AlertPayload = {
            event,
            site: name,
            hostname: target.hostname,
            heading: message.heading,
            intro: message.intro,
            items: message.bullets,
            reportUrl,
        };
        const delivery = await deliverWebhook(
            { url: webhookUrl, kind: target.webhook_kind ?? 'generic', secret },
            payload,
        );
        await recordWebhookResult(pool, target.id, delivery);
        return emailed.ok || delivery.ok;
    };
}

/** Stamps the last webhook delivery outcome, clearing the error on success. */
async function recordWebhookResult(
    pool: pg.Pool,
    targetId: string,
    delivery: { ok: boolean; error?: string },
): Promise<void> {
    try {
        await pool.query(
            delivery.ok
                ? 'UPDATE targets SET webhook_failed_at = NULL, webhook_last_error = NULL WHERE id = $1'
                : 'UPDATE targets SET webhook_failed_at = now(), webhook_last_error = $2 WHERE id = $1',
            delivery.ok ? [targetId] : [targetId, (delivery.error ?? 'Delivery failed').slice(0, 300)],
        );
    } catch (err) {
        console.error('Could not record webhook delivery result:', err);
    }
}

/**
 * Findings present in this scan but absent from the most recent completed scan
 * before it.
 *
 * Exported because the CI gate (api/scans/index.ts) asks the same question the
 * alert does — "what is new since last time?" — and two implementations of
 * that would inevitably disagree about which build to fail.
 */
export async function findNewIssues(
    pool: pg.Pool,
    targetId: string,
    scanId: string,
    findings: Finding[],
): Promise<Finding[]> {
    const { rows: previous } = await pool.query(
        `SELECT f.check_id, f.title, f.severity, f.affected_url
           FROM findings f
           JOIN scans s ON s.id = f.scan_id
          WHERE s.target_id = $1 AND s.status = 'completed' AND s.id <> $2
          ORDER BY s.completed_at DESC`,
        [targetId, scanId],
    );
    // No prior scan at all: this is the first audit, so everything is "new"
    // and reporting it would just restate the report we already emailed.
    if (!previous.length) return [];

    const { rows: lastScan } = await pool.query(
        `SELECT id FROM scans
          WHERE target_id = $1 AND status = 'completed' AND id <> $2
          ORDER BY completed_at DESC LIMIT 1`,
        [targetId, scanId],
    );
    if (!lastScan.length) return [];

    const { rows: lastFindings } = await pool.query(
        'SELECT check_id, title, severity, affected_url FROM findings WHERE scan_id = $1',
        [lastScan[0].id],
    );
    const before = new Set(lastFindings.map(identity));

    return findings.filter(f => ALERTABLE.has(f.severity) && !before.has(identity({
        check_id: f.checkId,
        title: f.title,
        severity: f.severity,
        affected_url: f.affectedUrl ?? null,
    })));
}

/**
 * Warns once per threshold as a certificate approaches expiry. Tracks the
 * threshold already sent so a daily scan doesn't email daily, and re-arms the
 * whole ladder when the expiry date moves — which is what renewing does.
 */
async function maybeWarnCertExpiry(
    pool: pg.Pool,
    target: AlertTarget,
    certExpiresAt: string,
    name: string,
    dispatch: Dispatch,
): Promise<boolean> {
    const expiry = new Date(certExpiresAt);
    if (Number.isNaN(expiry.getTime())) return false;

    const knownExpiry = target.cert_expires_at ? new Date(target.cert_expires_at).getTime() : null;
    const renewed = knownExpiry !== null && knownExpiry !== expiry.getTime();
    const alreadyNotified = renewed ? null : target.cert_expiry_notified_days;

    const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
    const crossed = CERT_THRESHOLDS.find(t => daysLeft <= t) ?? null;

    const shouldSend = crossed !== null && daysLeft >= 0
        && (alreadyNotified === null || crossed < alreadyNotified);

    if (shouldSend) {
        const ok = await dispatch('cert-expiry', {
            subject: `TLS certificate for ${name} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
            heading: 'Certificate expiring',
            intro: `${name}'s TLS certificate expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. If it lapses, every visitor gets a full-page security warning.`,
            bullets: [
                `Expires: ${expiry.toUTCString()}`,
                'Renew it, and set up automated renewal so this cannot recur.',
            ],
        });
        if (ok) {
            await pool.query(
                'UPDATE targets SET cert_expires_at = $2, cert_expiry_notified_days = $3 WHERE id = $1',
                [target.id, expiry.toISOString(), crossed],
            );
            return true;
        }
    }

    // Record the observed expiry (and clear a stale threshold after a renewal)
    // even when nothing was sent, so the next scan compares against the truth.
    await pool.query(
        'UPDATE targets SET cert_expires_at = $2, cert_expiry_notified_days = $3 WHERE id = $1',
        [target.id, expiry.toISOString(), renewed ? null : target.cert_expiry_notified_days],
    );
    return false;
}

/** Human-readable differences between two fingerprints, limited to things worth waking someone up for. Exported for testing. */
export function describeChanges(before: SiteFingerprint, after: SiteFingerprint): string[] {
    const changes: string[] = [];

    const beforeHeaders = before.headers ?? {};
    const afterHeaders = after.headers ?? {};
    for (const header of new Set([...Object.keys(beforeHeaders), ...Object.keys(afterHeaders)])) {
        const was = beforeHeaders[header];
        const now = afterHeaders[header];
        if (was === now) continue;
        if (was && !now) changes.push(`${header} is gone (was set)`);
        else if (!was && now) changes.push(`${header} is now set`);
        else changes.push(`${header} changed`);
    }

    const knownHosts = new Set(before.scriptHosts ?? []);
    const added = (after.scriptHosts ?? []).filter(host => !knownHosts.has(host));
    for (const host of added) changes.push(`New third-party script loading from ${host}`);

    const currentHosts = new Set(after.scriptHosts ?? []);
    const removed = (before.scriptHosts ?? []).filter(host => !currentHosts.has(host));
    for (const host of removed) changes.push(`Third-party script from ${host} is no longer loaded`);

    return changes;
}
