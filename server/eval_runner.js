'use strict';
const fs   = require('fs');
const path = require('path');

const { keywordClassifyBatch, gptClassify, THEMES } = require('./classifier');
const { classifyWithDeBERTa } = require('./deberta');
const { gEval } = require('./geval');
const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ARTICLES_PATH = path.resolve(__dirname, '../data/labeled_articles.json');
const RESULTS_PATH  = path.resolve(__dirname, '../data/eval_results.json');

function computeMetrics(predictions, labels) {
  const accuracy = predictions.filter((p, i) => p === labels[i]).length / labels.length;
  const stats = {};
  for (const t of THEMES) {
    const tp = predictions.filter((p, i) => p === t && labels[i] === t).length;
    const fp = predictions.filter((p, i) => p === t && labels[i] !== t).length;
    const fn = predictions.filter((p, i) => p !== t && labels[i] === t).length;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall    = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1        = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    stats[t] = { precision: +precision.toFixed(4), recall: +recall.toFixed(4), f1: +f1.toFixed(4) };
  }
  const macroF1 = THEMES.reduce((s, t) => s + stats[t].f1, 0) / THEMES.length;
  return { accuracy: +accuracy.toFixed(4), macroF1: +macroF1.toFixed(4), perClass: stats };
}

async function runEvaluation() {
  const articles = JSON.parse(fs.readFileSync(ARTICLES_PATH, 'utf8'));
  const labels   = articles.map(a => a.label);
  console.log(`[Eval] Starting evaluation on ${articles.length} articles...`);

  const results = { timestamp: new Date().toISOString(), modelVersion: EVAL_MODEL_VERSION, classifiers: {} };

  // Keyword baseline
  const kwPreds = keywordClassifyBatch(articles);
  results.classifiers.keyword = computeMetrics(kwPreds, labels);
  console.log(`[Eval] Keyword done. Macro F1: ${results.classifiers.keyword.macroF1}`);

  // GPT zero-shot in batches of 20 with 500ms delay
  let gptPreds = [];
  for (let i = 0; i < articles.length; i += 20) {
    const batch     = articles.slice(i, i + 20);
    const batchPreds = await gptClassify(batch);
    if (!batchPreds) {
      console.warn('[Eval] GPT batch failed, using keyword fallback for batch');
      gptPreds = gptPreds.concat(keywordClassifyBatch(batch));
    } else {
      gptPreds = gptPreds.concat(batchPreds);
    }
    if (i + 20 < articles.length) await new Promise(r => setTimeout(r, 500));
  }
  results.classifiers.gpt = computeMetrics(gptPreds, labels);
  console.log(`[Eval] GPT zero-shot done. Macro F1: ${results.classifiers.gpt.macroF1}`);

  // DeBERTa — graceful skip if Python unavailable
  const texts = articles.map(a => `${a.title} ${a.snippet || ''}`);
  const debPreds = await classifyWithDeBERTa(texts);
  if (debPreds && debPreds.length === articles.length) {
    results.classifiers.deberta = computeMetrics(debPreds, labels);
    console.log(`[Eval] DeBERTa done. Macro F1: ${results.classifiers.deberta.macroF1}`);
  } else {
    console.warn('[Eval] DeBERTa unavailable or returned wrong length — skipping.');
    results.classifiers.deberta = null;
  }

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log('[Eval] Results written to data/eval_results.json');

  // Startup G-Eval: generate a sample summary and score it so the hero never shows blank
  try {
    const sample = articles.filter(a => a.label === 'renewable').slice(0, 8);
    const articleText = sample.map((a, i) => `${i + 1}. ${a.title}${a.snippet ? ': ' + a.snippet : ''}`).join('\n');
    const summaryRes = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `You are a sustainability journalist. Summarise the following news in 3 concise paragraphs.\n\nArticles:\n${articleText}` }],
      temperature: 0.4, max_tokens: 350,
    });
    const summary = summaryRes.choices[0].message.content.trim();
    const scores  = await gEval(summary, sample.map(a => a.title));
    const fresh   = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    fresh.geval   = { ...scores, updatedAt: new Date().toISOString() };
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(fresh, null, 2));
    console.log('[Eval] Startup G-Eval done:', scores);
  } catch (err) {
    console.warn('[Eval] Startup G-Eval skipped:', err.message);
  }
}

const EVAL_MODEL_VERSION = 'deberta-v3-base-zeroshot-v2';

async function runOnce() {
  if (fs.existsSync(RESULTS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
      if (data.classifiers && data.modelVersion === EVAL_MODEL_VERSION) {
        console.log('[Eval] Classifier results already exist — skipping evaluation.');
        return;
      }
      console.log('[Eval] Model version changed or missing — re-running evaluation.');
    } catch {}
  }
  runEvaluation().catch(err => console.error('[Eval] Fatal error:', err.message));
}

module.exports = { runOnce };
