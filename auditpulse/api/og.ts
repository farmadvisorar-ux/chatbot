import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMethod } from './_lib/http.js';
import { getScanByToken } from './_lib/scanLookup.js';
import { renderShareCardPng } from './_lib/ogImage.js';

/**
 * Generates the social-preview image for one specific report — the dynamic
 * counterpart to the static /og-image.png every other page uses. Public,
 * no-auth, keyed on the same share_token as api/report.ts: a link scraper
 * (iMessage, WhatsApp, Slack, SMS, Facebook, X...) fetches this the instant
 * someone shares a report link, so it has to work with no session and
 * render fast. Not "cheatable" into showing a fake grade for someone else's
 * site — the grade/host always come from the token's own DB row, never from
 * the query string.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!requireMethod(req, res, ['GET'])) return;
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    const scan = token ? await getScanByToken(token) : null;
    // No token, unknown token, or a scan that hasn't finished yet (no grade
    // to show): fall back to the generic brand card rather than erroring —
    // a broken image is a worse preview than a slightly-generic one.
    if (!scan || scan.status !== 'completed' || !scan.grade) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.redirect(302, '/og-image.png');
        return;
    }

    let host = scan.target_url;
    try {
        host = new URL(scan.target_url).hostname.replace(/^www\./, '');
    } catch {
        // target_url failed to parse as a URL (shouldn't happen — it's validated
        // on the way in); fall back to showing it verbatim rather than 500ing.
    }

    const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .format(new Date(scan.completed_at || scan.started_at));

    const png = await renderShareCardPng({ host, grade: scan.grade, summary: scan.summary, dateLabel });

    res.setHeader('Content-Type', 'image/png');
    // Findings can change on the next re-scan, so this isn't cached forever —
    // but crawlers hit it in bursts right after a link is shared, and
    // stale-while-revalidate keeps that burst fast without serving a
    // week-old grade indefinitely.
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(png);
}
