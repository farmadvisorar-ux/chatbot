import * as cheerio from 'cheerio';

/**
 * Best-effort cleanup of a raw Wayback Machine snapshot: strips the
 * injected archive.org toolbar, rewrites archived absolute asset/link URLs
 * back to their original form, and neutralizes a small blocklist of known
 * spam link patterns.
 *
 * This is NOT a security scanner. It does not detect or remove arbitrary
 * malicious JavaScript, obfuscated redirects, or anything outside the
 * patterns below. Treat deployed output as "cleaner", not "safe" — review
 * before pointing a real domain at it.
 */

const WAYBACK_PREFIX_RE = /^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\//i;
const TOOLBAR_COMMENT_RE =
    /<!--\s*BEGIN WAYBACK TOOLBAR INSERT\s*-->[\s\S]*?<!--\s*END WAYBACK TOOLBAR INSERT\s*-->/gi;

const SPAM_LINK_PATTERNS = [/bit\.ly/i, /\bcasino\b/i, /crypto-spam/i, /\bviagra\b/i, /\bcialis\b/i];

const REWRITABLE_ATTRS = ['href', 'src'] as const;

export interface SanitizeResult {
    html: string;
    strippedLinks: number;
    rewrittenAssets: number;
}

function stripWaybackPrefix(value: string): string {
    return WAYBACK_PREFIX_RE.test(value) ? value.replace(WAYBACK_PREFIX_RE, '') : value;
}

export function sanitizeSnapshotHtml(rawHtml: string): SanitizeResult {
    const withoutToolbarComment = rawHtml.replace(TOOLBAR_COMMENT_RE, '');
    const $ = cheerio.load(withoutToolbarComment);

    $('#wm-ipp-base, #wm-ipp, .wm-ab, #donato').remove();

    // Rewrite archived-but-legitimate asset URLs (still wearing the
    // /web/<ts>id_/ wayback prefix, which itself contains "archive.org")
    // back to their original host BEFORE stripping archive.org's own
    // injected resources below — otherwise the substring match removes
    // the page's real stylesheets/scripts along with the toolbar's.
    let rewrittenAssets = 0;
    $('[href], [src], [srcset]').each((_, el) => {
        const node = $(el);
        for (const attr of REWRITABLE_ATTRS) {
            const val = node.attr(attr);
            if (val && WAYBACK_PREFIX_RE.test(val)) {
                node.attr(attr, stripWaybackPrefix(val));
                rewrittenAssets++;
            }
        }
        const srcset = node.attr('srcset');
        if (srcset) {
            const rewritten = srcset
                .split(',')
                .map((candidate) => {
                    const trimmed = candidate.trim();
                    const [url, descriptor] = trimmed.split(/\s+/, 2);
                    const cleanUrl = stripWaybackPrefix(url);
                    return descriptor ? `${cleanUrl} ${descriptor}` : cleanUrl;
                })
                .join(', ');
            if (rewritten !== srcset) {
                node.attr('srcset', rewritten);
                rewrittenAssets++;
            }
        }
    });

    // Now that archived-but-legitimate URLs have been rewritten away from
    // web.archive.org, anything still pointing at archive.org is genuinely
    // an archive.org-hosted resource (their toolbar assets, analytics).
    $('script[src*="archive.org"], link[href*="archive.org"]').remove();

    let strippedLinks = 0;
    $('a[href]').each((_, el) => {
        const node = $(el);
        const href = node.attr('href') ?? '';
        if (SPAM_LINK_PATTERNS.some((rx) => rx.test(href))) {
            node.removeAttr('href');
            node.attr('rel', 'nofollow');
            strippedLinks++;
        }
    });

    return { html: $.html(), strippedLinks, rewrittenAssets };
}
