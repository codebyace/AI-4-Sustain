'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const OpenAI   = require('openai');

const { fetchArticles }       = require('./gdelt');
const { keywordClassify }     = require('./classifier');
const { gEval }               = require('./geval');
const { runOnce }             = require('./eval_runner');
const { seedOnce }            = require('./seed_articles');

const app    = express();
const PORT   = process.env.PORT || 3000;
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EVAL_PATH  = path.resolve(__dirname, '../data/eval_results.json');
const TREND_PATH = path.resolve(__dirname, '../data/trend_data.json');

function logTrend(theme, count) {
  try {
    const data = fs.existsSync(TREND_PATH) ? JSON.parse(fs.readFileSync(TREND_PATH, 'utf8')) : {};
    const day  = new Date().toISOString().slice(0, 10);
    if (!data[theme]) data[theme] = {};
    data[theme][day] = (data[theme][day] || 0) + count;
    fs.writeFileSync(TREND_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../public')));

// ── GET / ──────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

// ── GET /api/eval ──────────────────────────────────────────────────────────
app.get('/api/eval', (_req, res) => {
  if (fs.existsSync(EVAL_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(EVAL_PATH, 'utf8'));
      return res.json(data);
    } catch {
      return res.json({ status: 'computing' });
    }
  }
  res.json({ status: 'computing' });
});

// ── GET /api/trends ───────────────────────────────────────────────────────
app.get('/api/trends', (_req, res) => {
  try {
    const data = fs.existsSync(TREND_PATH) ? JSON.parse(fs.readFileSync(TREND_PATH, 'utf8')) : {};
    res.json(data);
  } catch { res.json({}); }
});

// ── POST /api/analyze ──────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { theme = 'renewable', region = 'global', timeWindow = '30d' } = req.body;

  try {
    // 1. Fetch articles
    const articles = await fetchArticles(theme, region, timeWindow);

    // Log trend data
    logTrend(theme, articles.length);

    // 2. Build chart data (article volume per day for last 7 days)
    const now = Date.now();
    const dayMs = 86400000;
    const dayLabels = [];
    const dayValues = [];
    for (let d = 6; d >= 0; d--) {
      const dayStart = now - (d + 1) * dayMs;
      const dayEnd   = now - d * dayMs;
      const label    = new Date(dayEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dayLabels.push(label);
      dayValues.push(articles.filter(a => {
        const t = new Date(a.date).getTime();
        return t >= dayStart && t < dayEnd;
      }).length);
    }

    // 3. GPT summary
    const articleText = articles.slice(0, 10).map((a, i) =>
      `${i + 1}. ${a.title}${a.snippet ? ': ' + a.snippet : ''}`
    ).join('\n');

    const summaryRes = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `You are a sustainability journalist. Summarise the following news articles about "${theme}" in 3–4 concise paragraphs. Focus on key trends, data points, and implications.\n\nArticles:\n${articleText}`,
      }],
      temperature: 0.4,
      max_tokens: 400,
    });
    const summary = summaryRes.choices[0].message.content.trim();

    // 4. Live keyword precision
    const predictions = articles.map(a => keywordClassify(`${a.title} ${a.snippet || ''}`));
    const keywordPrecision = +(predictions.filter(p => p === theme).length / Math.max(predictions.length, 1)).toFixed(4);

    // 5. Background G-Eval (fire and forget)
    const titles = articles.map(a => a.title);
    gEval(summary, titles).then(scores => {
      try {
        let existing = {};
        if (fs.existsSync(EVAL_PATH)) {
          existing = JSON.parse(fs.readFileSync(EVAL_PATH, 'utf8'));
        }
        existing.geval = { ...scores, updatedAt: new Date().toISOString() };
        fs.writeFileSync(EVAL_PATH, JSON.stringify(existing, null, 2));
      } catch (e) {
        console.error('[G-Eval write]', e.message);
      }
    });

    const evalReady = fs.existsSync(EVAL_PATH);

    res.json({
      articles,
      summary,
      chartData: { labels: dayLabels, values: dayValues },
      keywordPrecision,
      evalReady,
    });
  } catch (err) {
    console.error('[/api/analyze]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[AI4Sustain] Server running on http://localhost:${PORT}`);
  seedOnce().then(() => runOnce());
});
