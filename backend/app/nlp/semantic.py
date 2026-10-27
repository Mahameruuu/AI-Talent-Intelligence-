"""Text similarity between a job description and a CV.

Uses a sentence-transformers model when ``EMBEDDING_MODEL`` is configured and the package is installed;
otherwise a TF-IDF cosine similarity (lexical, not semantic) computed in pure Python. The backend in use
is always reported, and the raw similarity is calibrated before it contributes to any score.
"""

from __future__ import annotations

import math
import re
import threading
from collections import Counter

STOPWORDS = set(
    """a an and are as at be by for from has have in is it its of on or that the to was were will with
    we you your our they their this these those i me my he she his her them who whom which what when where
    why how all any both each few more most other some such no nor not only own same so than too very can
    just should now also into over under about after before between during through up down out off again
    further then once here there able across etc using use used work working worked responsible role team
    dan yang di ke dari untuk dengan pada dalam atau ini itu sebagai oleh akan adalah juga serta kami kita
    saya mereka tersebut telah sudah bisa dapat lebih para setiap secara agar karena bagi tentang hingga""".split()
)
_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]{1,}")

_model_lock = threading.Lock()
_model = None
_model_name: str | None = None
_model_error: str | None = None


def _tokens(text: str) -> list[str]:
    return [t.lower().strip(".-") for t in _TOKEN_RE.findall(text) if t.lower() not in STOPWORDS and len(t) > 1]


def _tfidf_cosine(a: str, b: str) -> float:
    ta, tb = Counter(_tokens(a)), Counter(_tokens(b))
    if not ta or not tb:
        return 0.0
    vocab = set(ta) | set(tb)
    # Two-document IDF: terms in both documents get a lower weight than distinctive terms,
    # but still positive so shared vocabulary drives similarity.
    idf = {t: 1.0 + math.log(2.0 / (1 + (t in ta) + (t in tb)) + 1.0) for t in vocab}
    va = {t: (1 + math.log(c)) * idf[t] for t, c in ta.items()}
    vb = {t: (1 + math.log(c)) * idf[t] for t, c in tb.items()}
    dot = sum(va[t] * vb.get(t, 0.0) for t in va)
    na = math.sqrt(sum(v * v for v in va.values()))
    nb = math.sqrt(sum(v * v for v in vb.values()))
    return dot / (na * nb) if na and nb else 0.0


def configure(model_name: str) -> None:
    global _model_name
    _model_name = model_name or None


def _load_model():
    global _model, _model_error
    if _model is not None or _model_error is not None or not _model_name:
        return _model
    with _model_lock:
        if _model is None and _model_error is None:
            try:
                from sentence_transformers import SentenceTransformer  # type: ignore

                _model = SentenceTransformer(_model_name)
            except Exception as exc:  # ImportError or model download failure
                _model_error = f"{type(exc).__name__}: {exc}"[:200]
    return _model


def backend_info() -> tuple[str, str]:
    if _model_name:
        model = _load_model()
        if model is not None:
            return f"sentence-transformers:{_model_name}", "Neural sentence embeddings (cosine similarity)."
        return "tfidf-lexical", f"Embedding model '{_model_name}' unavailable ({_model_error}); using TF-IDF fallback."
    return "tfidf-lexical", "TF-IDF cosine similarity (lexical overlap). Set EMBEDDING_MODEL to enable neural embeddings."


def similarity(job_text: str, cv_text: str) -> tuple[float, float, str]:
    """Return (raw_similarity, calibrated_score_0_100, backend)."""
    model = _load_model() if _model_name else None
    if model is not None:
        vectors = model.encode([job_text[:4000], cv_text[:8000]], normalize_embeddings=True)
        raw = float(sum(x * y for x, y in zip(vectors[0], vectors[1])))
        # Sentence-embedding cosine for related documents typically falls in ~0.2..0.75.
        low, high = 0.20, 0.75
        backend = f"sentence-transformers:{_model_name}"
    else:
        raw = _tfidf_cosine(job_text, cv_text)
        # Lexical cosine between a JD and a CV is typically 0.05-0.45 even for strong matches; the wide
        # range keeps this a supporting signal rather than saturating at 100.
        low, high = 0.05, 0.60
        backend = "tfidf-lexical"
    calibrated = max(0.0, min(1.0, (raw - low) / (high - low))) * 100
    return raw, round(calibrated, 1), backend
