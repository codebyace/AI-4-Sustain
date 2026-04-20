# AI4Sustain — Sustainability News Intelligence

University LLM Course Final Project 2026.

A web app that fetches live environmental news from GDELT, generates GPT-4o-mini RAG summaries, and evaluates classification quality using DeBERTa zero-shot NLI, GPT zero-shot, and a keyword baseline.

## Setup

```bash
# 1. Install Node dependencies
npm install

# 2. Install Python ML dependencies
pip install -r ml/requirements.txt

# 3. Configure your API key
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...

# 4. Start the server
node server/server.js
```

Open http://localhost:3000 in your browser.

## First Run

On startup the server will automatically:
1. Download the DeBERTa model (~500 MB, one time only, saved to ml/model_cache/)
2. Run classification evaluation on data/labeled_articles.json (~3 minutes)
3. Write results to data/eval_results.json

The evaluation runs in the background — the UI is usable immediately and the metrics panel updates automatically when the evaluation finishes.

## Project Structure

```
ai4sustain/
├── server/
│   ├── server.js        Express backend
│   ├── gdelt.js         GDELT news fetcher
│   ├── classifier.js    Keyword + GPT zero-shot classifiers
│   ├── deberta.js       DeBERTa subprocess bridge
│   ├── geval.js         G-Eval scoring
│   └── eval_runner.js   Startup evaluation orchestrator
├── ml/
│   ├── deberta_infer.py HuggingFace zero-shot pipeline
│   ├── requirements.txt Python dependencies
│   └── model_cache/     Auto-downloaded model weights
├── data/
│   ├── labeled_articles.json  50 hand-labeled sustainability articles
│   └── eval_results.json      Generated on first startup
├── public/
│   └── index.html       Full single-page frontend
├── .env.example
└── package.json
```

## Themes

| Key | Description |
|-----|-------------|
| `renewable` | Solar, wind, hydrogen, geothermal, EV |
| `emissions` | CO₂, methane, net zero, fossil fuels |
| `biodiversity` | Deforestation, wildlife, coral reefs |
| `water` | Floods, drought, glaciers, sea level |
| `policy` | COP, Paris Agreement, carbon tax, legislation |
