import crypto from 'node:crypto';
import { json, query, isConfigured } from './_lib/index.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method not allowed. Use GET.' });
    }

    if (!isConfigured()) {
      return json(res, 501, { error: 'Not configured.' });
    }

    const token = String(req.query.token ?? '').trim();
    if (!token || !/^[a-f0-9]{32}$/.test(token)) {
      return json(res, 400, { error: 'Invalid certificate token.' });
    }

    const result = await query(`
      SELECT le.edition_number, le.variation, o.email, o.shipping_name, oi.name as product_name, oi.quantity,
             to_char(o.paid_at, 'Mon DD, YYYY') as date_paid
      FROM limited_editions le
      JOIN orders o ON le.order_id = o.id
      JOIN order_items oi ON o.id = oi.order_id
      WHERE le.certificate_token = $1 AND o.status = 'paid'
      LIMIT 1
    `, [token]);

    if (!result.rows.length) {
      return json(res, 404, { error: 'Certificate not found or order not paid.' });
    }

    const cert = result.rows[0];

    return json(res, 200, {
      edition: cert.edition_number,
      product: cert.product_name,
      owner: cert.shipping_name || cert.email,
      quantity: cert.quantity,
      variation: cert.variation || 'Original Release',
      datePaid: cert.date_paid,
      status: 'First Addition',
      rarity: cert.edition_number <= 50 ? 'Ultra Rare' : 'Rare',
      certificateId: token,
    });
  } catch (err) {
    console.error('[certificate]', err);
    return json(res, 500, { error: 'Could not retrieve certificate.' });
  }
}
