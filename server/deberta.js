'use strict';
const axios = require('axios');

const HF_MODEL = 'facebook/bart-large-mnli';
const HF_API   = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
const LABELS   = ['renewable energy', 'carbon emissions', 'biodiversity', 'water resources', 'climate policy'];

const LABEL_MAP = {
  'renewable energy': 'renewable',
  'carbon emissions':  'emissions',
  'biodiversity':      'biodiversity',
  'water resources':   'water',
  'climate policy':    'policy',
};

async function classifyOne(text, retries = 3) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.HF_TOKEN) headers['Authorization'] = `Bearer ${process.env.HF_TOKEN}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await axios.post(HF_API, {
        inputs: text.slice(0, 512),
        parameters: { candidate_labels: LABELS },
      }, { headers, timeout: 40000 });

      if (res.data?.error?.includes?.('loading')) {
        const wait = (attempt + 1) * 8000;
        console.log(`[NLI] Model loading, waiting ${wait / 1000}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      const best = res.data.labels?.[0];
      return best ? (LABEL_MAP[best] || best) : null;
    } catch (err) {
      const msg = (err.response?.data?.error || err.message || '').toString().slice(0, 200);
      if (msg.includes('loading') && attempt < retries - 1) {
        const wait = (attempt + 1) * 8000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.error('[NLI] error:', msg);
      return null;
    }
  }
  return null;
}

async function classifyWithDeBERTa(texts) {
  console.log(`[NLI] Classifying ${texts.length} texts via HuggingFace (${HF_MODEL})…`);
  const predictions = [];
  let failCount = 0;

  for (let i = 0; i < texts.length; i++) {
    const pred = await classifyOne(texts[i]);
    if (pred === null) failCount++;
    predictions.push(pred || 'renewable');
    if (i < texts.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  if (failCount === texts.length) {
    console.error('[NLI] All predictions failed — returning null.');
    return null;
  }

  console.log(`[NLI] Done. ${texts.length - failCount}/${texts.length} succeeded.`);
  return predictions;
}

module.exports = { classifyWithDeBERTa };
