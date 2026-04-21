"""
Local DeBERTa zero-shot classification server.
Runs on port 5001. Start before the Node server:
    pip install flask transformers torch
    python server/deberta_server.py
"""
from flask import Flask, request, jsonify
from transformers import pipeline
import sys

app = Flask(__name__)

MODEL = 'MoritzLaurer/deberta-v3-base-zeroshot-v1'
LABELS = ['renewable energy', 'carbon emissions', 'biodiversity', 'water resources', 'climate policy']
LABEL_MAP = {
    'renewable energy': 'renewable',
    'carbon emissions':  'emissions',
    'biodiversity':      'biodiversity',
    'water resources':   'water',
    'climate policy':    'policy',
}

print(f'[DeBERTa] Loading {MODEL}…', flush=True)
try:
    classifier = pipeline('zero-shot-classification', model=MODEL, device=-1)
    print('[DeBERTa] Model ready.', flush=True)
except Exception as e:
    print(f'[DeBERTa] Failed to load model: {e}', file=sys.stderr)
    sys.exit(1)


@app.route('/classify', methods=['POST'])
def classify():
    texts = request.json.get('texts', [])
    predictions = []
    for text in texts:
        try:
            result = classifier(text[:512], LABELS, multi_label=False)
            best = result['labels'][0]
            predictions.append(LABEL_MAP.get(best, best))
        except Exception as e:
            print(f'[DeBERTa] classify error: {e}', file=sys.stderr)
            predictions.append(None)
    return jsonify({'predictions': predictions})


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'model': MODEL})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
