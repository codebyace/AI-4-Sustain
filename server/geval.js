'use strict';
require('dotenv').config();
const OpenAI = require('openai');

async function gEval(summary, articleTitles) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `You are evaluating an AI-generated news summary.
Source article titles: ${articleTitles.join(', ')}
Summary: ${summary}

Rate on three dimensions from 1.0 to 5.0.
Return ONLY valid JSON, no markdown fences:
{"relevance": X.X, "coherence": X.X, "grounding": X.X}`;

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 80,
    });
    const raw = res.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
    const scores = JSON.parse(raw);
    return {
      relevance:  parseFloat(scores.relevance)  || null,
      coherence:  parseFloat(scores.coherence)  || null,
      grounding:  parseFloat(scores.grounding)  || null,
    };
  } catch (err) {
    console.error('[G-Eval] error:', err.message);
    return { relevance: null, coherence: null, grounding: null };
  }
}

module.exports = { gEval };
