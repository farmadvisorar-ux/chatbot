const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { isValidDomain, normalizeDomain, isValidTimestamp } = require('../lib/validators');
const { rebuildSnapshot } = require('../lib/sanitizeSnapshot');

const router = express.Router();

const DEFAULT_TIMESTAMP = '20210101000000';
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024;

const recoverLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many recovery requests. Please wait a minute and try again.' },
});

/**
 * POST /api/recover
 * Body: { domain: "examplehairsalon.com", timestamp: "20220115000000" }
 * Fetches a historical Wayback Machine snapshot for `domain` and returns sanitized HTML safe
 * to render. `timestamp` is optional (defaults to a generic historical date) and must be a
 * 14-digit Wayback timestamp (YYYYMMDDHHMMSS).
 */
router.post('/recover', recoverLimiter, async (req, res) => {
  const { domain, timestamp } = req.body || {};

  if (!isValidDomain(domain)) {
    return res.status(400).json({ success: false, error: 'A valid domain name is required.' });
  }

  const targetTimestamp = timestamp || DEFAULT_TIMESTAMP;
  if (!isValidTimestamp(targetTimestamp)) {
    return res.status(400).json({ success: false, error: 'Timestamp must be 14 digits (YYYYMMDDHHMMSS).' });
  }

  const cleanDomain = normalizeDomain(domain);
  const archiveUrl = `https://web.archive.org/web/${targetTimestamp}id_/http://${cleanDomain}`;

  try {
    const response = await axios.get(archiveUrl, {
      headers: { 'User-Agent': 'WebsiteSnapshotRecovery/1.0 (+https://web.archive.org)' },
      timeout: 15000,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      validateStatus: (status) => status === 200,
    });

    if (!response.data) {
      return res.status(404).json({ success: false, error: 'No historical snapshot data found.' });
    }

    const sanitizedHtml = rebuildSnapshot(String(response.data));

    return res.status(200).json({
      success: true,
      message: 'Website snapshot recovered and sanitized successfully.',
      domain: cleanDomain,
      timestamp: targetTimestamp,
      data: sanitizedHtml,
    });
  } catch (error) {
    console.error('Snapshot recovery error:', error.message);
    const status = error.response?.status === 404 ? 404 : 502;
    return res.status(status).json({
      success: false,
      error: 'Failed to retrieve or sanitize the historical snapshot.',
    });
  }
});

module.exports = router;
