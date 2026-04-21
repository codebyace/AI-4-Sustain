'use strict';
const axios = require('axios');

const HF_MODEL = 'MoritzLaurer/deberta-v3-base-zeroshot-v1';
const HF_API   = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
const LABELS   = ['renewable energy', 'carbon emissions', 'biodiversity', 'water resources', 'climate policy'];

const LABEL_MAP = {
  'renewable energy': 'renewable',
  'carbon emissions':  'emissions',
  'biodiversity':      'biodiversity',
  'water resources':   'water',
  'climate policy':    'policy',
};

async function classifyOne(text) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.HF_TOKEN) headers['Authorization'] = `Bearer ${process.env.HF_TOKEN}`;

  const res = await axios.post(HF_API, {
    inputs: text.slice(0, 512),
    parameters: { candidate_labels: LABELS },
  }, { headers, timeout: 30000 });

  const best = res.data.labels?.[0];
  return best ? (LABEL_MAP[best] || best) : null;
}

async function classifyWithDeBERTa(texts) {
  try {
    console.log(`[DeBERTa API] Classifying ${texts.length} texts via HuggingFace...`);
    const predictions = [];
    for (let i = 0; i < texts.length; i++) {
      const pred = await classifyOne(texts[i]);
      if (!pred) { console.error('[DeBERTa API] null prediction at index', i); return null; }
      predictions.push(pred);
      if (i < texts.length - 1) await new Promise(r => setTimeout(r, 300));
    }
    console.log('[DeBERTa API] Done.');
    return predictions;
  } catch (err) {
    console.error('[DeBERTa API] error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { classifyWithDeBERTa };
