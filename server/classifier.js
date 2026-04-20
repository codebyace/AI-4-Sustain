'use strict';
require('dotenv').config();
const OpenAI = require('openai');

const KEYWORD_MAP = {
  renewable:    ['solar','wind','renewable','geothermal','hydrogen','turbine','photovoltaic','battery','ev','electric vehicle'],
  emissions:    ['carbon','emission','methane','co2','greenhouse','fossil','net zero','decarbonize','decarbonise'],
  biodiversity: ['species','forest','wildlife','ecosystem','biodiversity','deforestation','coral','reef','extinction'],
  water:        ['ocean','water','flood','drought','river','sea level','groundwater','glacier','aquifer'],
  policy:       ['policy','agreement','cop','law','regulation','government','treaty','pledge','summit','legislation'],
};

const THEMES = Object.keys(KEYWORD_MAP);

function keywordClassify(text) {
  const lower = (text || '').toLowerCase();
  const scores = {};
  for (const theme of THEMES) {
    scores[theme] = KEYWORD_MAP[theme].filter(kw => lower.includes(kw)).length;
  }
  return THEMES.reduce((best, t) => scores[t] > scores[best] ? t : best, THEMES[0]);
}

function keywordClassifyBatch(articles) {
  return articles.map(a => keywordClassify(`${a.title} ${a.snippet || ''}`));
}

async function gptClassify(articles) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const batch = articles.slice(0, 20);
  const listText = batch.map((a, i) =>
    `${i + 1}. Title: ${a.title}\n   Snippet: ${a.snippet || ''}`
  ).join('\n');

  const prompt = `Classify each article into exactly one category: renewable, emissions, biodiversity, water, policy
Return ONLY a JSON array of category strings in the same order as the articles. No explanation.
Articles:
${listText}`;

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 200,
    });
    const raw = res.choices[0].message.content.trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((p, i) => {
      const lower = (p || '').toLowerCase().trim();
      return THEMES.includes(lower) ? lower : keywordClassify(batch[i]?.title || '');
    });
  } catch (err) {
    console.error('[Classifier] GPT error:', err.message);
    return null;
  }
}

module.exports = { keywordClassify, keywordClassifyBatch, gptClassify, THEMES };
