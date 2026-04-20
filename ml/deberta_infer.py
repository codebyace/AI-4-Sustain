#!/usr/bin/env python3
"""
Zero-shot classification using cross-encoder/nli-deberta-v3-small.
No training required — model downloads automatically on first run.

Usage:
  python3 deberta_infer.py --texts '["article text 1", "article text 2"]' \
                           --labels "renewable energy,carbon emissions,biodiversity,water resources,climate policy"

Prints ONLY a JSON array of predicted labels to stdout.
"""

import sys
import json
import argparse
import os

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--texts", required=True, help="JSON array of text strings")
    parser.add_argument("--labels", required=True, help="Comma-separated candidate labels")
    args = parser.parse_args()

    try:
        texts = json.loads(args.texts)
        labels = [l.strip() for l in args.labels.split(",")]
    except Exception as e:
        sys.stderr.write(f"[deberta] Arg parse error: {e}\n")
        print("[]")
        sys.exit(0)

    if not texts:
        print("[]")
        sys.exit(0)

    try:
        # Suppress HuggingFace progress bars / logs
        os.environ["TRANSFORMERS_VERBOSITY"] = "error"
        os.environ["TOKENIZERS_PARALLELISM"] = "false"

        from transformers import pipeline

        cache_dir = os.path.join(os.path.dirname(__file__), "model_cache")
        os.makedirs(cache_dir, exist_ok=True)

        sys.stderr.write("[deberta] Loading zero-shot pipeline...\n")
        classifier = pipeline(
            "zero-shot-classification",
            model="cross-encoder/nli-deberta-v3-small",
            cache_dir=cache_dir,
            device=-1,  # CPU only
        )
        sys.stderr.write(f"[deberta] Running inference on {len(texts)} texts...\n")

        predictions = []
        for text in texts:
            # Truncate to 512 chars to stay within model token limits
            truncated = text[:512] if len(text) > 512 else text
            result = classifier(truncated, candidate_labels=labels, multi_label=False)
            best_label = result["labels"][0]
            predictions.append(best_label)

        print(json.dumps(predictions))

    except Exception as e:
        sys.stderr.write(f"[deberta] Inference error: {e}\n")
        print("[]")
        sys.exit(0)


if __name__ == "__main__":
    main()
