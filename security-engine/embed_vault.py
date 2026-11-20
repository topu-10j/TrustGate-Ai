"""Optional local multilingual retrieval embeddings. No company data is sent to a model API."""
import json
import sys
from sentence_transformers import SentenceTransformer

MODEL = "intfloat/multilingual-e5-small"

def main():
    data = json.load(sys.stdin)
    mode = data["mode"]
    texts = data["texts"]
    if mode not in ("query", "passage") or not isinstance(texts, list) or not 1 <= len(texts) <= 120:
        raise ValueError("Invalid embedding input")
    if not all(isinstance(text, str) and len(text) <= 800 for text in texts):
        raise ValueError("Invalid embedding text")
    model = SentenceTransformer(MODEL, device="cpu", trust_remote_code=False)
    vectors = model.encode([mode + ": " + text for text in texts], normalize_embeddings=True,
                           batch_size=12, show_progress_bar=False)
    print(json.dumps(vectors.tolist(), allow_nan=False, separators=(",", ":")))

if __name__ == "__main__":
    main()
