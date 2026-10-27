"""Minimal background worker for long-running jobs (CV processing, interview evaluation).

Runs jobs in a thread pool inside the API process with their own app context and DB session. Job state
lives in the database (document/evaluation status), so the API can always report progress. For
production, swap this module for a real queue (RQ/Celery) behind the same ``submit`` function.
"""

from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from flask import Flask

from .extensions import db

log = logging.getLogger(__name__)


class Worker:
    def __init__(self):
        self.app: Flask | None = None
        self.executor: ThreadPoolExecutor | None = None
        self.inline = False
        self.max_workers = 0
        self._lock = threading.Lock()
        self.queued = 0
        self.running = 0
        self._keys: set[str] = set()

    def init_app(self, app: Flask) -> None:
        self.app = app
        self.inline = app.config.get("WORKER_INLINE", False)
        self.max_workers = app.config.get("WORKER_MAX_WORKERS", 2)
        if not self.inline and self.executor is None:
            self.executor = ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="ti-worker")

    def submit(self, key: str, fn: Callable, *args) -> bool:
        """Queue ``fn(*args)``. ``key`` de-duplicates identical pending jobs (e.g. 'document:12')."""
        with self._lock:
            if key in self._keys:
                return False
            self._keys.add(key)
            self.queued += 1
        if self.inline:
            self._run(key, fn, *args)
        else:
            assert self.executor is not None
            self.executor.submit(self._run, key, fn, *args)
        return True

    def _run(self, key: str, fn: Callable, *args) -> None:
        with self._lock:
            self.queued -= 1
            self.running += 1
        try:
            assert self.app is not None
            if self.inline:
                fn(*args)
            else:
                with self.app.app_context():
                    try:
                        fn(*args)
                    finally:
                        db.session.remove()
        except Exception:
            log.exception("Background job %s failed", key)
        finally:
            with self._lock:
                self.running -= 1
                self._keys.discard(key)


worker = Worker()
