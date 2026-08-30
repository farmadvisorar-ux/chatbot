import crypto from 'node:crypto';
import { json, query, isConfigured } from './_lib/index.js';

async function issueCertificate(orderId) {
  if (!isConfigured()) return null;

  try {
    const editionResult = await query(`
      SELECT nextval('edition_counter') as edition_number
    `);

    const editionNumber = editionResult.rows[0].edition_number;
    if (editionNumber > 200) return null;

    const certificateToken = crypto.randomBytes(16).toString('hex');
    const serialHash = crypto
      .createHash('sha256')
      .update(`${orderId}-${editionNumber}-${Date.now()}`)
      .digest('hex');

    await query(`
      INSERT INTO limited_editions (order_id, edition_number, certificate_token, serial_hash, variation)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (order_id) DO NOTHING
    `, [orderId, editionNumber, certificateToken, serialHash, 'Original Release']);

    return {
      token: certificateToken,
      edition: editionNumber,
      url: `${process.env.SITE_URL || 'https://www.tooiicy.com'}/certificate.html?token=${certificateToken}`,
    };
  } catch (err) {
    console.error('[issueCertificate]', err);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Method not allowed. Use POST.' });
    }

    if (!isConfigured()) {
      return json(res, 501, { error: 'Not configured.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const orderId = String(body.orderId ?? '').trim();

    if (!orderId || !/^[a-f0-9\-]{36}$/.test(orderId)) {
      return json(res, 400, { error: 'Invalid order ID.' });
    }

    const certificate = await issueCertificate(orderId);

    if (!certificate) {
      return json(res, 410, { error: 'All 200 limited editions have been issued.' });
    }

    return json(res, 201, {
      certificateToken: certificate.token,
      edition: certificate.edition,
      certificateUrl: certificate.url,
    });
  } catch (err) {
    console.error('[issue-certificate]', err);
    return json(res, 500, { error: 'Could not issue certificate.' });
  }
}

export { issueCertificate };
