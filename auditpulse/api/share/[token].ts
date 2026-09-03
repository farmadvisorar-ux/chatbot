import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMethod } from '../_lib/http.js';
import { getScanByToken } from '../_lib/scanLookup.js';
import { siteOrigin } from '../_lib/site.js';
import { escapeHtml } from '../../src/escape-html.js';

/**
 * The link that actually gets shared/emailed/copied for a report — NOT
 * report.html itself. report.html is a static SPA shell (one build output,
 * identical for every report) that fetches its data client-side from the
 * token, so a scraper that doesn't run JS (every social/SMS/email link
 * previewer) would see the same generic meta tags for every report no
 * matter whose it is. This route exists purely to give each report its own
 * real preview: it renders per-scan <meta> tags server-side from the DB,
 * then immediately sends a real visitor on to the interactive report. Two
 * redirect mechanisms (meta-refresh + JS) because crawlers don't run JS and
 * a handful of older/embedded browsers don't honor meta-refresh.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const origin = siteOrigin();
    const reportUrl = `${origin}/report.html?token=${encodeURIComponent(token)}`;

    const scan = token ? await getScanByToken(token) : null;

    let title = 'Security audit report — AuditPulse';
    let description = 'A full security audit: severity-ranked findings, explained in plain English, with the fixes.';
    const imageUrl = `${origin}/api/og${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    if (scan && scan.status === 'completed' && scan.grade) {
        let host = scan.target_url;
        try {
            host = new URL(scan.target_url).hostname.replace(/^www\./, '');
        } catch {
            // Not a parseable URL — fall back to the raw stored value.
        }
        const total = Object.values(scan.summary).reduce((a, b) => a + b, 0);
        title = `${host} scored ${scan.grade} — AuditPulse security audit`;
        description = total > 0
            ? `${total} finding${total === 1 ? '' : 's'}: ${scan.summary.critical} critical, ${scan.summary.high} high, ${scan.summary.medium} medium, ${scan.summary.low} low. See the full report.`
            : 'No issues found in this audit. See the full report.';
    }

    const shareUrl = `${origin}/api/share/${encodeURIComponent(token)}`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="robots" content="noindex">
    <meta http-equiv="refresh" content="0;url=${escapeHtml(reportUrl)}">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(shareUrl)}">
    <meta property="og:site_name" content="AuditPulse">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <meta name="theme-color" content="#0a0d13">
    <script>location.replace(${JSON.stringify(reportUrl)});</script>
</head>
<body style="margin:0;background:#0a0d13;color:#e9edf5;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
    <p>Redirecting to your report… <a href="${escapeHtml(reportUrl)}" style="color:#35e0a1">Click here if it doesn't happen automatically.</a></p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(html);
}
