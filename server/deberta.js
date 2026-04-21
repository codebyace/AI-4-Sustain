'use strict';
const axios = require('axios');

const HF_MODEL = 'cross-encoder/nli-deberta-v3-small';
const HF_API   = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

const LABELS = ['renewable energy', 'carbon emissions', 'biodiversity', 'water resources', 'climate policy'];

const LABEL_MAP = {
  'renewable energy': 'renewable',
  'carbon emissions':  'emissions',
  'biodiversity':      'biodiversity',
  'water resources':   'water',
  'climate policy':    'policy',
};

// Cross-encoder NLI models expect text pairs: (premise, hypothesis)
// We send all 5 label hypotheses in one batched call and pick highest entailment
async function classifyOne(text, retries = 3) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.HF_TOKEN) headers['Authorization'] = `Bearer ${process.env.HF_TOKEN}`;

  const inputs = LABELS.map(label => ({
    text:      text.slice(0, 512),
    text_pair: `This text is about ${label}.`,
  }));

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await axios.post(HF_API, { inputs }, { headers, timeout: 40000 });

      // Handle model loading
      if (res.data?.error?.includes?.('loading')) {
        const wait = (attempt + 1) * 8000;
        console.log(`[DeBERTa] Model loading, waiting ${wait / 1000}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      // res.data is an array of [{label, score}] per input pair
      const results = res.data;
      if (!Array.isArray(results) || results.length !== LABELS.length) return null;

      // Each result is array of NLI classes; find ENTAILMENT score per label
      let bestLabel = null, bestScore = -1;
      for (let i = 0; i < LABELS.length; i++) {
        const classScores = Array.isArray(results[i]) ? results[i] : [results[i]];
        const entailment  = classScores.find(c => c.label?.toUpperCase().includes('ENTAIL'));
        const score       = entailment?.score ?? 0;
        if (score > bestScore) { bestScore = score; bestLabel = LABELS[i]; }
      }

      return bestLabel ? (LABEL_MAP[bestLabel] || bestLabel) : null;
    } catch (err) {
      const msg = (err.response?.data?.error || err.message || '').toString().slice(0, 200);
      if (msg.includes('loading') && attempt < retries - 1) {
        const wait = (attempt + 1) * 8000;
        console.log(`[DeBERTa] Loading retry ${attempt + 1}, waiting ${wait / 1000}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.error('[DeBERTa] error:', msg);
      return null;
    }
  }
  return null;
}

async function classifyWithDeBERTa(texts) {
  console.log(`[DeBERTa] Classifying ${texts.length} texts via HuggingFace (${HF_MODEL})…`);
  const predictions = [];
  let failCount = 0;

  for (let i = 0; i < texts.length; i++) {
    const pred = await classifyOne(texts[i]);
    if (pred === null) { failCount++; }
    predictions.push(pred);
    if (i < texts.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  if (failCount === texts.length) {
    console.error('[DeBERTa] All predictions failed — returning null.');
    return null;
  }

  console.log(`[DeBERTa] Done. ${texts.length - failCount}/${texts.length} succeeded.`);
  return predictions;
}

module.exports = { classifyWithDeBERTa };
