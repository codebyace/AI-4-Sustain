'use strict';
const axios = require('axios');

// cross-encoder/nli-deberta-v3-small is a genuine DeBERTa NLI model available
// on HF's free serverless API. We implement zero-shot classification manually:
// for each candidate label, score entailment probability, pick the highest.
const HF_MODEL = 'cross-encoder/nli-deberta-v3-small';
const HF_API   = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

const CANDIDATE_LABELS = ['renewable energy', 'carbon emissions', 'biodiversity', 'water resources', 'climate policy'];
const LABEL_MAP = {
  'renewable energy': 'renewable',
  'carbon emissions':  'emissions',
  'biodiversity':      'biodiversity',
  'water resources':   'water',
  'climate policy':    'policy',
};

function getHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (process.env.HF_TOKEN) h['Authorization'] = `Bearer ${process.env.HF_TOKEN}`;
  return h;
}

// Extract entailment score from whatever shape HF returns
function entailmentScore(result) {
  const flat = Array.isArray(result?.[0]) ? result[0] : result;
  if (!Array.isArray(flat)) return 0;
  const row = flat.find(r => r.label?.toUpperCase() === 'ENTAILMENT');
  return row?.score ?? 0;
}

// Score one (premise, hypothesis) pair — returns entailment probability
async function scoreOne(premise, hypothesis, retries = 3) {
  const input = `${premise.slice(0, 400)} [SEP] ${hypothesis}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await axios.post(HF_API, { inputs: input }, { headers: getHeaders(), timeout: 35000 });
      if (res.data?.error?.includes?.('loading')) {
        const wait = (attempt + 1) * 8000;
        console.log(`[NLI] Model loading, waiting ${wait / 1000}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return entailmentScore(res.data);
    } catch (err) {
      const msg = (err.response?.data?.error || err.message || '').toString().slice(0, 200);
      if (msg.includes('loading') && attempt < retries - 1) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 8000));
        continue;
      }
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      console.error(`[NLI] scoreOne error (attempt ${attempt + 1}, status ${err.response?.status}):`, msg);
      return -1; // sentinel for total failure
    }
  }
  return -1;
}

async function classifyOne(text) {
  const scores = {};
  let allFailed = true;
  for (const label of CANDIDATE_LABELS) {
    const s = await scoreOne(text, `This text is about ${label}.`);
    scores[label] = s;
    if (s >= 0) allFailed = false;
    await new Promise(r => setTimeout(r, 150));
  }
  if (allFailed) return null;
  // treat -1 (failure) as 0 when picking best
  const best = CANDIDATE_LABELS.reduce((a, b) => (scores[a] ?? 0) >= (scores[b] ?? 0) ? a : b);
  return LABEL_MAP[best] || best;
}

async function classifyWithDeBERTa(texts) {
  console.log(`[NLI] Zero-shot NLI via ${HF_MODEL} on ${texts.length} texts…`);
  const predictions = [];
  let failCount = 0;

  for (let i = 0; i < texts.length; i++) {
    const pred = await classifyOne(texts[i]);
    if (pred === null) failCount++;
    predictions.push(pred || 'renewable');
    if (i < texts.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  if (failCount === texts.length) {
    console.error('[NLI] All predictions failed — returning null.');
    return null;
  }

  console.log(`[NLI] Done. ${texts.length - failCount}/${texts.length} succeeded.`);
  return predictions;
}

module.exports = { classifyWithDeBERTa };
