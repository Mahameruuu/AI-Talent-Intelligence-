"""In-process scheduler for periodic jobs: automatic AI-interview invitations and the daily data retention run.

A single daemon thread ticks every ``AUTO_INVITE_INTERVAL_SECONDS`` (default 60, so "on_close" invitations go out
within about a minute of the closing time; and once shortly after startup). A tick with nothing due costs one
small query for auto-invite plus an hour check for retention. Each job's
batch is claimed atomically in the database (``services/auto_invite.claim``), so running several API processes
never sends a job's invitations twice. Not started in tests, for ``flask`` CLI commands other than ``run``, or when
``AUTO_INVITE_ENABLED=false`` and ``RETENTION_SCHEDULER_ENABLED=false``. Data retention
(``services/retention.tick()``) claims each day atomically, so it runs once per day at ``RETENTION_HOUR``. For production with many workers, this can move to a cron/queue beat process
calling ``services.auto_invite.tick()``.
"""

from __future__ import annotations

import logging
import os
import sys
import threading

from flask import Flask

from .extensions import db

log = logging.getLogger(__name__)

STARTUP_DELAY_SECONDS = 15


def _cli_command_without_server() -> bool:
    """True for e.g. ``flask db upgrade`` / ``flask seed-demo`` (short-lived, must not send emails)."""
    argv0 = sys.argv[0] if sys.argv else ""
    is_flask_cli = os.path.basename(argv0) in ("flask", "flask.exe") or argv0.endswith(os.path.join("flask", "__main__.py"))
    return is_flask_cli and "run" not in sys.argv[1:]


class Scheduler:
    def __init__(self):
        self.app: Flask | None = None
        self.thread: threading.Thread | None = None
        self._stop = threading.Event()

    def init_app(self, app: Flask) -> None:
        self.app = app
        if app.config.get("TESTING") or not (self._auto_invite_enabled() or self._retention_enabled()):
            return
        if _cli_command_without_server() or self.thread is not None:
            return
        self.thread = threading.Thread(target=self._loop, name="ti-scheduler", daemon=True)
        self.thread.start()
        log.info("Scheduler started (every %ss; auto-invite %s, data retention %s)",
                 app.config["AUTO_INVITE_INTERVAL_SECONDS"], self._auto_invite_enabled(), self._retention_enabled())

    def _auto_invite_enabled(self) -> bool:
        return bool(self.app and self.app.config.get("AUTO_INVITE_ENABLED", True))

    def _retention_enabled(self) -> bool:
        return bool(self.app and self.app.config.get("RETENTION_SCHEDULER_ENABLED", True))

    def stop(self) -> None:
        self._stop.set()

    def run_once(self) -> None:
        from .services import auto_invite, retention

        assert self.app is not None
        for enabled, tick in ((self._auto_invite_enabled(), auto_invite.tick),
                              (self._retention_enabled(), retention.tick)):
            if not enabled:
                continue
            try:
                with self.app.app_context():
                    try:
                        tick()
                    finally:
                        db.session.remove()
            except Exception:  # never let the thread die
                log.exception("Scheduler tick failed")

    def _loop(self) -> None:
        assert self.app is not None
        interval = max(10, int(self.app.config.get("AUTO_INVITE_INTERVAL_SECONDS", 60)))
        if self._stop.wait(STARTUP_DELAY_SECONDS):
            return
        while not self._stop.is_set():
            self.run_once()
            self._stop.wait(interval)


scheduler = Scheduler()
