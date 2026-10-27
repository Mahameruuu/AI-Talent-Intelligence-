"""Private document storage on the local filesystem (outside any web-served directory).

Swap for object storage (S3/GCS with private buckets) in production behind the same functions.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from flask import current_app


def _root() -> Path:
    root = Path(current_app.config["DOCUMENT_STORAGE_DIR"])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root


def save(data: bytes, extension: str) -> str:
    key = f"{uuid.uuid4().hex}{extension}"
    path = _root() / key
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)
    return key


def load(key: str) -> bytes:
    path = (_root() / key).resolve()
    if path.parent != _root().resolve():
        raise ValueError("Invalid storage key")
    return path.read_bytes()


def remove(key: str) -> None:
    """Delete a stored file (missing files are ignored)."""
    path = (_root() / key).resolve()
    if path.parent == _root().resolve():
        path.unlink(missing_ok=True)
