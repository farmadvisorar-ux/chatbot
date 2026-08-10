import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, isDatabaseConfigured } from './_lib/db.js';
import { json, requireMethod, clientKey } from './_lib/http.js';
import { clean, validEmail, validUrl } from './_lib/validate.js';
import { checkRateLimit } from './_lib/rateLimit.js';
import { PUBLISHER_SHARE_PERCENT } from './_lib/pricing.js';
import { guarded } from './_lib/errors.js';

/**
 * Publisher signup: someone who wants to place the Sikads ad unit on their own
 * site and earn a share of what advertisers pay for views served there.
 *
 * Like paid campaigns, publishers land in pending_review rather than going
 * straight to active. An unreviewed slot key is a way to mint earnings by
 * looping the serve endpoint against a page nobody visits, so the review is
 * what stands between the payout ledger and anyone willing to write a for-loop.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    await guarded('publishers', res, async () => {
        if (!requireMethod(req, res, ['POST'])) return;

        if (!isDatabaseConfigured()) {
            json(res, 501, { error: 'Publisher signups are not open yet. Check back shortly.' });
            return;
        }

        const pool = getPool();
        if (!(await checkRateLimit(pool, 'publisher-signup', clientKey(req), 5, 60))) {
            json(res, 429, { error: 'Too many signups from this network. Try again later.' });
            return;
        }

        const body = (req.body || {}) as { email?: string; siteUrl?: string };
        const email = clean(body.email, 254).toLowerCase();
        const siteUrl = clean(body.siteUrl, 2048);

        if (!email || !siteUrl) {
            json(res, 400, { error: 'Your email and the site you will place the unit on are both required' });
            return;
        }
        if (!validEmail(email)) {
            json(res, 400, { error: 'Enter a valid email' });
            return;
        }
        if (!validUrl(siteUrl)) {
            json(res, 400, { error: 'Enter a valid site URL, starting with http:// or https://' });
            return;
        }

        // Signing up twice returns the original slot key instead of erroring, so a
        // publisher who lost the snippet can get it back by repeating the form
        // rather than being told their email is taken.
        // A rejected publisher who fixes their site and re-applies should get
        // another review rather than staying permanently locked out while the
        // conflict path silently refreshes site_url under status=rejected.
        const { rows } = await pool.query(
            `INSERT INTO publishers (email, site_url, slot_key)
             VALUES ($1, $2, 'sk_' || encode(gen_random_bytes(8), 'hex'))
             ON CONFLICT (email) DO UPDATE SET
                 site_url = EXCLUDED.site_url,
                 status = CASE
                     WHEN publishers.status = 'rejected' THEN 'pending_review'
                     ELSE publishers.status
                 END
             RETURNING slot_key, status`,
            [email, siteUrl],
        );
        const publisher = rows[0];
        if (!publisher) {
            json(res, 500, { error: 'Could not create the publisher account' });
            return;
        }

        json(res, 200, {
            ok: true,
            slotKey: publisher.slot_key,
            status: publisher.status,
            sharePercent: PUBLISHER_SHARE_PERCENT,
        });
    });
}
