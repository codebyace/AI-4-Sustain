'use strict';
const axios = require('axios');
const { keywordClassify } = require('./classifier');

const HF_MODEL = 'cross-encoder/nli-deberta-v3-small';
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

      // HF returns 503 with loading message as JSON
      if (res.data?.error?.includes('loading')) {
        const wait = (attempt + 1) * 8000;
        console.log(`[DeBERTa API] Model loading, waiting ${wait/1000}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      const best = res.data.labels?.[0];
      return best ? (LABEL_MAP[best] || best) : null;
    } catch (err) {
      const msg = err.response?.data?.error || err.message || '';
      if (msg.includes('loading') && attempt < retries - 1) {
        const wait = (attempt + 1) * 8000;
        console.log(`[DeBERTa API] Model loading (${attempt + 1}), waiting ${wait/1000}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.warn(`[DeBERTa API] classifyOne failed (attempt ${attempt + 1}):`, msg.toString().slice(0, 120));
      return null;
    }
  }
  return null;
}

async function classifyWithDeBERTa(texts) {
  console.log(`[DeBERTa API] Classifying ${texts.length} texts via HuggingFace (${HF_MODEL})…`);
  const predictions = [];
  let nullCount = 0;

  for (let i = 0; i < texts.length; i++) {
    let pred = await classifyOne(texts[i]);
    if (!pred) {
      // Fall back to keyword classifier for this article rather than aborting
      pred = keywordClassify(texts[i]);
      nullCount++;
      console.warn(`[DeBERTa API] fallback to keyword at index ${i}: ${pred}`);
    }
    predictions.push(pred);
    if (i < texts.length - 1) await new Promise(r => setTimeout(r, 400));
  }

  console.log(`[DeBERTa API] Done. ${texts.length - nullCount}/${texts.length} from HF, ${nullCount} keyword fallbacks.`);
  return predictions;
}

module.exports = { classifyWithDeBERTa };
