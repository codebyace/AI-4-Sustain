'use strict';
const fs   = require('fs');
const path = require('path');
const { fetchArticles } = require('./gdelt');

const ARTICLES_PATH = path.resolve(__dirname, '../data/labeled_articles.json');
const TARGET = 20; // per theme
const THEMES = ['renewable', 'emissions', 'biodiversity', 'water', 'policy'];

async function seedArticles() {
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(ARTICLES_PATH, 'utf8')); } catch {}

  const countByTheme = {};
  for (const t of THEMES) countByTheme[t] = existing.filter(a => a.label === t).length;
  const needsSeeding = THEMES.some(t => countByTheme[t] < TARGET);

  if (!needsSeeding) {
    console.log(`[Seed] Already have ${existing.length} labeled articles — skipping.`);
    return;
  }

  console.log('[Seed] Fetching real articles from GDELT to reach 100 labeled…');
  const seenUrls = new Set(existing.map(a => a.url));
  let id = existing.length ? Math.max(...existing.map(a => a.id || 0)) + 1 : 1;
  const toAdd = [];

  for (const theme of THEMES) {
    const needed = TARGET - countByTheme[theme];
    if (needed <= 0) continue;
    console.log(`[Seed] ${theme}: need ${needed} more articles`);

    try {
      for (const tw of ['30d', '90d', '365d']) {
        const alreadyHave = countByTheme[theme] + toAdd.filter(a => a.label === theme).length;
        if (alreadyHave >= TARGET) break;
        const articles = await fetchArticles(theme, 'global', tw);
        for (const a of articles) {
          const alreadyHave2 = countByTheme[theme] + toAdd.filter(a => a.label === theme).length;
          if (alreadyHave2 >= TARGET) break;
          if (!seenUrls.has(a.url) && a.title.length > 10) {
            seenUrls.add(a.url);
            toAdd.push({ id: id++, title: a.title, snippet: a.snippet || a.title, label: theme, url: a.url, source: a.source, date: a.date });
          }
        }
        await new Promise(r => setTimeout(r, 3000)); // 3s between GDELT requests to avoid 429
      }
    } catch (err) {
      console.warn(`[Seed] Failed to fetch ${theme}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2000)); // 2s between themes
  }

  const final = [...existing, ...toAdd];
  fs.writeFileSync(ARTICLES_PATH, JSON.stringify(final, null, 2));
  console.log(`[Seed] Done. ${final.length} total labeled articles saved.`);
}

async function seedOnce() {
  try {
    await seedArticles();
  } catch (err) {
    console.error('[Seed] Fatal error:', err.message);
  }
}

module.exports = { seedOnce };
