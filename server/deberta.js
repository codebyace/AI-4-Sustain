'use strict';
const axios = require('axios');

// Calls the local DeBERTa Flask server (server/deberta_server.py).
// Set DEBERTA_URL env var to override; defaults to localhost:5001.
const DEBERTA_URL = (process.env.DEBERTA_URL || 'http://localhost:5001').replace(/\/$/, '');

async function classifyWithDeBERTa(texts) {
  console.log(`[NLI] Calling local DeBERTa server at ${DEBERTA_URL} for ${texts.length} texts…`);
  try {
    const res = await axios.post(`${DEBERTA_URL}/classify`, { texts }, { timeout: 180000 });
    const preds = res.data?.predictions;
    if (!Array.isArray(preds) || preds.length !== texts.length) {
      console.error('[NLI] Unexpected response shape from DeBERTa server.');
      return null;
    }
    const failCount = preds.filter(p => p === null).length;
    console.log(`[NLI] Done. ${texts.length - failCount}/${texts.length} succeeded.`);
    // Replace nulls with 'renewable' fallback
    return preds.map(p => p || 'renewable');
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.warn('[NLI] DeBERTa server not running — skipping. Start server/deberta_server.py locally.');
    } else {
      console.error('[NLI] DeBERTa server error:', err.message);
    }
    return null;
  }
}

module.exports = { classifyWithDeBERTa };
