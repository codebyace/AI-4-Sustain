'use strict';
const { spawn } = require('child_process');
const path = require('path');

const LABEL_MAP = {
  'renewable energy': 'renewable',
  'carbon emissions':  'emissions',
  'biodiversity':      'biodiversity',
  'water resources':   'water',
  'climate policy':    'policy',
};

const LABELS = Object.keys(LABEL_MAP).join(',');
const SCRIPT  = path.resolve(__dirname, '../ml/deberta_infer.py');

async function classifyWithDeBERTa(texts) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.error('[DeBERTa] Timeout after 120s');
      child.kill();
      resolve(null);
    }, 120000);

    let stdout = '';
    let stderr = '';

    const child = spawn('python3', [
      SCRIPT,
      '--texts', JSON.stringify(texts),
      '--labels', LABELS,
    ], { cwd: path.resolve(__dirname, '..') });

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (stderr) console.error('[DeBERTa stderr]', stderr.slice(0, 500));
      try {
        const raw = stdout.trim();
        if (!raw) { resolve(null); return; }
        const predictions = JSON.parse(raw);
        if (!Array.isArray(predictions) || predictions.length === 0) { resolve(null); return; }
        const mapped = predictions.map(p => LABEL_MAP[p] || p);
        resolve(mapped);
      } catch (e) {
        console.error('[DeBERTa] Parse error:', e.message);
        resolve(null);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[DeBERTa] Spawn error:', err.message);
      resolve(null);
    });
  });
}

module.exports = { classifyWithDeBERTa };
